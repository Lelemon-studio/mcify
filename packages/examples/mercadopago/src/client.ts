/**
 * Minimal Mercado Pago API client — Chilean payment links + payments.
 *
 * API reference: https://www.mercadopago.cl/developers/es/reference
 *
 * Auth: each merchant has an access token from their MP integration.
 * The client sends it in the `Authorization: Bearer ...` header on every
 * request.
 *
 * Conceptual model (important):
 * MP separates the *Preference* (the payment link) from the *Payment*
 * (the actual transaction). The merchant creates a preference, the
 * customer opens the `init_point` URL and pays, and MP creates one or
 * more payments associated with that preference. Refunds operate on
 * payments, not preferences.
 *
 * The connector hides this duality from the agent: tools accept and
 * return a single id (the preference id), and the client resolves the
 * underlying payment internally when it needs to.
 */

import type {
  PaymentLinkInput,
  PaymentLinkResult,
  PaymentLinkStatus,
  PaymentMethodItem,
  RefundResult,
} from './types-payment.js';

const DEFAULT_BASE_URL = 'https://api.mercadopago.com';

export interface MercadoPagoClientOptions {
  /** Access token from the merchant's MP integration. */
  accessToken: string;
  /** Override the API base URL. Useful for fixture servers. */
  baseUrl?: string;
  /** Inject a fetch implementation. Tests pass a mock here. */
  fetch?: typeof globalThis.fetch;
  /**
   * Whether to prefer `sandbox_init_point` over `init_point` when
   * returning the payment URL. The connector sets this from the
   * session's `environment`.
   */
  preferSandboxInitPoint?: boolean;
}

export class MercadoPagoApiError extends Error {
  override readonly name = 'MercadoPagoApiError';
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------
// Native MP shapes (the bits we use).
// ---------------------------------------------------------------------

/** MP payment status. We translate this to the portable status. */
export type MercadoPagoPaymentStatus =
  | 'pending'
  | 'approved'
  | 'authorized'
  | 'in_process'
  | 'in_mediation'
  | 'rejected'
  | 'cancelled'
  | 'refunded'
  | 'charged_back';

interface MercadoPagoPreferenceResponse {
  id: string;
  init_point?: string;
  sandbox_init_point?: string;
  date_created?: string;
  date_of_expiration?: string;
  external_reference?: string;
  expires?: boolean;
  items?: { unit_price?: number; currency_id?: string; title?: string }[];
}

interface MercadoPagoPaymentResponse {
  id: number;
  status: MercadoPagoPaymentStatus;
  status_detail?: string;
  date_approved?: string | null;
  external_reference?: string;
  preference_id?: string;
  transaction_amount?: number;
  currency_id?: string;
  description?: string;
  receipt_url?: string;
}

interface MercadoPagoSearchPayments {
  results?: MercadoPagoPaymentResponse[];
}

interface MercadoPagoRefundResponse {
  id?: number;
  payment_id?: number;
  amount?: number;
  status?: string;
}

interface MercadoPagoPaymentMethodResponse {
  id: string;
  name: string;
  payment_type_id?: string;
  status?: string;
  thumbnail?: string;
}

// ---------------------------------------------------------------------
// Status mapper — MP native → portable.
// ---------------------------------------------------------------------

/**
 * Translate an MP payment status to the portable lifecycle.
 *
 * - `approved` / `authorized` → `paid`. The customer's bank confirmed.
 * - `pending` / `in_process` / `in_mediation` → `pending`. Waiting.
 * - `rejected` → `failed`. Customer declined.
 * - `cancelled` → `cancelled`.
 * - `refunded` / `charged_back` → `refunded`.
 */
export const mapMercadoPagoStatus = (
  status: MercadoPagoPaymentStatus | undefined,
): PaymentLinkStatus => {
  switch (status) {
    case 'approved':
    case 'authorized':
      return 'paid';
    case 'pending':
    case 'in_process':
    case 'in_mediation':
    case undefined:
      return 'pending';
    case 'rejected':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'refunded':
    case 'charged_back':
      return 'refunded';
    default: {
      const _exhaustive: never = status;
      void _exhaustive;
      return 'pending';
    }
  }
};

// ---------------------------------------------------------------------
// MercadoPagoClient
// ---------------------------------------------------------------------

export class MercadoPagoClient {
  private readonly accessToken: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly preferSandbox: boolean;

  constructor(options: MercadoPagoClientOptions) {
    if (!options.accessToken) {
      throw new TypeError('MercadoPagoClient: `accessToken` is required');
    }
    this.accessToken = options.accessToken;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.preferSandbox = options.preferSandboxInitPoint ?? false;
  }

  // -------------------------------------------------------------------
  // Preferences (payment links)
  // -------------------------------------------------------------------

  async createPreference(input: PaymentLinkInput): Promise<PaymentLinkResult> {
    const body = this.buildPreferenceBody(input);
    const raw = (await this.request(
      'POST',
      '/checkout/preferences/',
      body,
    )) as MercadoPagoPreferenceResponse;
    return this.preferenceToResult(raw, input, 'pending');
  }

  async getPreference(preferenceId: string): Promise<PaymentLinkResult> {
    const raw = (await this.request(
      'GET',
      `/checkout/preferences/${encodeURIComponent(preferenceId)}`,
    )) as MercadoPagoPreferenceResponse;

    // Fetch latest associated payment to derive status.
    const payment = await this.findLatestPaymentByPreferenceId(preferenceId);
    const status = payment ? mapMercadoPagoStatus(payment.status) : 'pending';
    const result = this.preferenceToResult(raw, undefined, status);
    if (payment) {
      const vendor = result.vendor?.mercadopago ?? {};
      result.vendor = {
        mercadopago: {
          ...vendor,
          paymentId: String(payment.id),
          paymentStatus: payment.status,
          ...(payment.status_detail ? { paymentStatusDetail: payment.status_detail } : {}),
        },
      };
      if (payment.date_approved) result.paidAt = payment.date_approved;
      if (payment.receipt_url) result.receiptUrl = payment.receipt_url;
    }
    return result;
  }

  // -------------------------------------------------------------------
  // Payments (the underlying transactions)
  // -------------------------------------------------------------------

  /**
   * Look up the most recent payment associated with a preference. Returns
   * null when the preference hasn't been paid yet.
   */
  async findLatestPaymentByPreferenceId(
    preferenceId: string,
  ): Promise<MercadoPagoPaymentResponse | null> {
    const search = new URLSearchParams({ preference_id: preferenceId, sort: 'date_created' });
    const raw = (await this.request(
      'GET',
      `/v1/payments/search?${search.toString()}`,
    )) as MercadoPagoSearchPayments;
    const results = raw.results ?? [];
    if (results.length === 0) return null;
    // MP returns oldest-first by default with sort=date_created; pick the latest.
    return results[results.length - 1] ?? null;
  }

  async getPayment(paymentId: string): Promise<MercadoPagoPaymentResponse> {
    return (await this.request(
      'GET',
      `/v1/payments/${encodeURIComponent(paymentId)}`,
    )) as MercadoPagoPaymentResponse;
  }

  // -------------------------------------------------------------------
  // Refunds
  // -------------------------------------------------------------------

  /**
   * Refund a payment. The `paymentId` arg can be either a preference id
   * (the connector resolves the underlying payment) or a payment id
   * (used directly).
   */
  async refundPayment(paymentIdOrPreferenceId: string, amount?: number): Promise<RefundResult> {
    const realPaymentId = await this.resolvePaymentId(paymentIdOrPreferenceId);
    if (!realPaymentId) {
      return {
        paymentId: paymentIdOrPreferenceId,
        refunded: false,
        message: 'No payment found for the given id (preference may not have been paid yet).',
      };
    }

    const body = amount !== undefined ? { amount } : {};
    const raw = (await this.request(
      'POST',
      `/v1/payments/${encodeURIComponent(realPaymentId)}/refunds`,
      body,
    )) as MercadoPagoRefundResponse;

    return {
      paymentId: paymentIdOrPreferenceId,
      refunded: raw.status !== 'rejected' && raw.status !== 'cancelled',
      ...(raw.id !== undefined ? { refundId: String(raw.id) } : {}),
      ...(raw.status ? { message: `refund ${raw.status}` } : {}),
    };
  }

  // -------------------------------------------------------------------
  // Catalogs
  // -------------------------------------------------------------------

  async listPaymentMethods(): Promise<PaymentMethodItem[]> {
    const raw = (await this.request(
      'GET',
      '/v1/payment_methods',
    )) as MercadoPagoPaymentMethodResponse[];
    return (raw ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      ...(m.payment_type_id ? { paymentTypeId: m.payment_type_id } : {}),
      ...(m.status ? { status: m.status } : {}),
      ...(m.thumbnail ? { thumbnail: m.thumbnail } : {}),
    }));
  }

  // -------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------

  private async resolvePaymentId(idMaybePreference: string): Promise<string | null> {
    // Heuristic: numeric strings are MP payment ids; alphanumeric ids are
    // preference ids. We try preference→payment lookup first because
    // confusing the two is the most common mistake.
    if (/^\d+$/.test(idMaybePreference)) {
      // It looks like a payment id directly.
      return idMaybePreference;
    }
    const payment = await this.findLatestPaymentByPreferenceId(idMaybePreference);
    return payment ? String(payment.id) : null;
  }

  private buildPreferenceBody(input: PaymentLinkInput): Record<string, unknown> {
    const v = input.vendor?.mercadopago;
    const items = v?.items?.length
      ? v.items.map((it) => ({
          title: it.title,
          quantity: it.quantity,
          unit_price: it.unitPrice,
          currency_id: input.currency,
          ...(it.description ? { description: it.description } : {}),
          ...(it.pictureUrl ? { picture_url: it.pictureUrl } : {}),
          ...(it.categoryId ? { category_id: it.categoryId } : {}),
        }))
      : [
          {
            title: input.subject,
            quantity: 1,
            unit_price: input.amount,
            currency_id: input.currency,
            ...(input.description ? { description: input.description } : {}),
          },
        ];

    const body: Record<string, unknown> = { items };

    if (input.externalId) body['external_reference'] = input.externalId;
    if (input.notifyUrl) body['notification_url'] = input.notifyUrl;
    if (input.expiresAt) {
      body['expires'] = true;
      body['date_of_expiration'] = input.expiresAt;
    }

    if (input.successUrl || input.cancelUrl) {
      const backUrls: Record<string, string> = {};
      if (input.successUrl) backUrls['success'] = input.successUrl;
      if (input.cancelUrl) backUrls['failure'] = input.cancelUrl;
      body['back_urls'] = backUrls;
    }

    if (input.customer) {
      const payer: Record<string, unknown> = {};
      if (input.customer.name) payer['name'] = input.customer.name;
      if (input.customer.email) payer['email'] = input.customer.email;
      if (input.customer.rut) {
        payer['identification'] = { type: 'RUT', number: input.customer.rut };
      }
      if (Object.keys(payer).length > 0) body['payer'] = payer;
    }

    if (v?.statementDescriptor) body['statement_descriptor'] = v.statementDescriptor;
    if (v?.autoReturn) body['auto_return'] = v.autoReturn;

    if (
      v?.excludedPaymentMethods?.length ||
      v?.excludedPaymentTypes?.length ||
      v?.installments !== undefined
    ) {
      const pm: Record<string, unknown> = {};
      if (v.excludedPaymentMethods?.length) {
        pm['excluded_payment_methods'] = v.excludedPaymentMethods.map((id) => ({ id }));
      }
      if (v.excludedPaymentTypes?.length) {
        pm['excluded_payment_types'] = v.excludedPaymentTypes.map((id) => ({ id }));
      }
      if (v.installments !== undefined) pm['installments'] = v.installments;
      body['payment_methods'] = pm;
    }

    return body;
  }

  private preferenceToResult(
    raw: MercadoPagoPreferenceResponse,
    input: PaymentLinkInput | undefined,
    status: PaymentLinkStatus,
  ): PaymentLinkResult {
    const url =
      this.preferSandbox && raw.sandbox_init_point ? raw.sandbox_init_point : raw.init_point;

    const result: PaymentLinkResult = {
      paymentId: raw.id,
      paymentUrl: url ?? '',
      status,
      amount: raw.items?.[0]?.unit_price ?? input?.amount ?? 0,
      currency: raw.items?.[0]?.currency_id ?? input?.currency ?? 'CLP',
      subject: raw.items?.[0]?.title ?? input?.subject ?? '',
    };
    if (raw.external_reference) result.externalId = raw.external_reference;
    else if (input?.externalId) result.externalId = input.externalId;
    if (raw.date_of_expiration) result.expiresAt = raw.date_of_expiration;

    if (raw.sandbox_init_point) {
      result.vendor = { mercadopago: { sandboxInitPoint: raw.sandbox_init_point } };
    }
    return result;
  }

  private async request(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const init: RequestInit = { method, headers };
    if (body !== undefined) init.body = JSON.stringify(body);

    const response = await this.fetchImpl(url, init);
    const text = await response.text();
    let parsed: unknown = text;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!response.ok) {
      throw new MercadoPagoApiError(
        extractMessage(parsed, response.status),
        response.status,
        parsed,
      );
    }
    return parsed;
  }
}

const extractMessage = (body: unknown, status: number): string => {
  if (body && typeof body === 'object') {
    const obj = body as { message?: unknown; error?: unknown; cause?: unknown };
    if (typeof obj.message === 'string' && obj.message.length > 0) return obj.message;
    if (typeof obj.error === 'string' && obj.error.length > 0) return obj.error;
    if (Array.isArray(obj.cause) && obj.cause.length > 0) {
      const first = obj.cause[0];
      if (first && typeof first === 'object') {
        const fObj = first as { description?: unknown; code?: unknown };
        if (typeof fObj.description === 'string') return fObj.description;
        if (typeof fObj.code === 'string') return `error code ${fObj.code}`;
      }
    }
  }
  if (typeof body === 'string' && body.length > 0) return body;
  return `Mercado Pago request failed: ${status}`;
};
