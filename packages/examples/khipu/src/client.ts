/**
 * Minimal Khipu API client — Chilean payment links.
 *
 * API reference: https://docs.khipu.com/payment-solutions/instant-payments/v2/main
 *
 * Auth: each merchant has an API key issued by Khipu. The client sends
 * it in the `x-api-key` header on every request — Khipu's v3 API
 * dropped request signing in favour of this simpler scheme.
 *
 * Environments: Khipu separates credentials between development
 * accounts and production accounts. The connector exposes
 * `environment: 'dev' | 'live'` on the session and points the client
 * at the same base URL — only the API key changes. (Khipu uses one
 * URL `https://payment-api.khipu.com/v3` for both; the key determines
 * scope.)
 *
 * The client is *stateless across orgs*: construct a fresh
 * `KhipuClient` per request using the resolved session. Don't cache
 * it across orgs.
 */

import type {
  BankItem,
  PaymentLinkInput,
  PaymentLinkResult,
  PaymentLinkStatus,
  PaymentMethodItem,
  RefundResult,
} from './types-payment.js';

const DEFAULT_BASE_URL = 'https://payment-api.khipu.com/v3';

export interface KhipuClientOptions {
  /** API key from the merchant's Khipu collection account. */
  apiKey: string;
  /** Override the API base URL. Useful for fixture servers. */
  baseUrl?: string;
  /** Inject a fetch implementation. Tests pass a mock here. */
  fetch?: typeof globalThis.fetch;
}

export class KhipuApiError extends Error {
  override readonly name = 'KhipuApiError';
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------
// Native Khipu shapes (snake_case on the wire).
// ---------------------------------------------------------------------

/**
 * Khipu's own payment status enum. We translate this into the
 * portable `PaymentLinkStatus` via {@link mapKhipuStatus}.
 */
export type KhipuPaymentStatus =
  | 'pending'
  | 'verifying'
  | 'done'
  | 'committed'
  | 'failed'
  | 'rejected';

interface KhipuPaymentRaw {
  payment_id: string;
  payment_url: string;
  simplified_transfer_url?: string;
  transfer_url?: string;
  webpay_url?: string;
  app_url?: string;
  ready_for_terminal?: boolean;
  notification_token?: string;
  expires_date?: string;
  conciliation_date?: string;
  status?: KhipuPaymentStatus;
  status_detail?: string;
  subject?: string;
  currency?: string;
  amount?: number;
  transaction_id?: string;
  receipt_url?: string;
  picture_url?: string;
}

interface KhipuBankRaw {
  bank_id: string;
  name: string;
  message?: string;
  min_amount?: number;
  type?: string;
}

interface KhipuPaymentMethodRaw {
  id: string;
  name: string;
  logo_url?: string;
  available?: boolean;
}

// ---------------------------------------------------------------------
// Status mapper — Khipu native → portable.
// ---------------------------------------------------------------------

/**
 * Translate a Khipu status into the portable six-state lifecycle.
 *
 * Khipu has separate `done` and `committed` for "paid" (the former
 * means cleared, the latter means settled to the merchant's account).
 * For agent-facing tools we collapse both into `paid` — the merchant
 * has the funds (or will after settlement) and the action is "done".
 *
 * `verifying` (Khipu is checking the bank transaction) collapses into
 * `pending` since the customer's perspective is "waiting".
 *
 * `rejected` means the customer was declined (e.g. anti-fraud); we
 * surface that as `failed` to keep the lifecycle simple.
 */
export const mapKhipuStatus = (status: KhipuPaymentStatus | undefined): PaymentLinkStatus => {
  switch (status) {
    case 'done':
    case 'committed':
      return 'paid';
    case 'failed':
    case 'rejected':
      return 'failed';
    case 'verifying':
    case 'pending':
    case undefined:
      return 'pending';
    default: {
      const _exhaustive: never = status;
      void _exhaustive;
      return 'pending';
    }
  }
};

// ---------------------------------------------------------------------
// KhipuClient
// ---------------------------------------------------------------------

export class KhipuClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(options: KhipuClientOptions) {
    if (!options.apiKey) {
      throw new TypeError('KhipuClient: `apiKey` is required');
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  // -------------------------------------------------------------------
  // Payments
  // -------------------------------------------------------------------

  async createPayment(input: PaymentLinkInput): Promise<PaymentLinkResult> {
    const body: Record<string, unknown> = {
      subject: input.subject,
      amount: input.amount,
      currency: input.currency,
    };
    if (input.externalId) body['transaction_id'] = input.externalId;
    if (input.description) body['body'] = input.description;
    if (input.successUrl) body['return_url'] = input.successUrl;
    if (input.cancelUrl) body['cancel_url'] = input.cancelUrl;
    if (input.notifyUrl) body['notify_url'] = input.notifyUrl;
    if (input.expiresAt) body['expires_date'] = input.expiresAt;

    if (input.customer?.name) body['payer_name'] = input.customer.name;
    if (input.customer?.email) body['payer_email'] = input.customer.email;
    if (input.customer?.rut) body['fixed_payer_personal_identifier'] = input.customer.rut;

    const v = input.vendor?.khipu;
    if (v?.bankId) body['bank_id'] = v.bankId;
    if (v?.mandatoryPaymentMethod) body['mandatory_payment_method'] = v.mandatoryPaymentMethod;
    if (v?.sendEmail !== undefined) body['send_email'] = v.sendEmail;
    if (v?.sendReminders !== undefined) body['send_reminders'] = v.sendReminders;
    if (v?.payerName) body['payer_name'] = v.payerName;
    if (v?.payerEmail) body['payer_email'] = v.payerEmail;
    if (v?.fixedPayerPersonalIdentifier) {
      body['fixed_payer_personal_identifier'] = v.fixedPayerPersonalIdentifier;
    }
    if (v?.integratorFee !== undefined) body['integrator_fee'] = v.integratorFee;

    const raw = (await this.request('POST', '/payments', body)) as KhipuPaymentRaw;
    return this.toResult(raw, input);
  }

  async getPayment(paymentId: string): Promise<PaymentLinkResult> {
    const raw = (await this.request(
      'GET',
      `/payments/${encodeURIComponent(paymentId)}`,
    )) as KhipuPaymentRaw;
    return this.toResult(raw);
  }

  async cancelPayment(paymentId: string): Promise<{ paymentId: string; cancelled: boolean }> {
    await this.request('DELETE', `/payments/${encodeURIComponent(paymentId)}`);
    return { paymentId, cancelled: true };
  }

  async refundPayment(paymentId: string, amount?: number): Promise<RefundResult> {
    const body = amount !== undefined ? { amount } : {};
    const raw = (await this.request(
      'POST',
      `/payments/${encodeURIComponent(paymentId)}/refunds`,
      body,
    )) as { message?: string } | undefined;
    return {
      paymentId,
      refunded: true,
      ...(raw?.message ? { message: raw.message } : {}),
    };
  }

  // -------------------------------------------------------------------
  // Catalogs
  // -------------------------------------------------------------------

  async listBanks(): Promise<BankItem[]> {
    const raw = (await this.request('GET', '/banks')) as
      | { banks?: KhipuBankRaw[] }
      | KhipuBankRaw[];
    const banks = Array.isArray(raw) ? raw : (raw.banks ?? []);
    return banks.map((b) => ({
      bankId: b.bank_id,
      name: b.name,
      ...(b.message ? { message: b.message } : {}),
      ...(b.min_amount !== undefined ? { minAmount: b.min_amount } : {}),
      ...(b.type ? { type: b.type } : {}),
    }));
  }

  async listPaymentMethods(): Promise<PaymentMethodItem[]> {
    const raw = (await this.request('GET', '/payment-methods')) as
      | { paymentMethods?: KhipuPaymentMethodRaw[]; payment_methods?: KhipuPaymentMethodRaw[] }
      | KhipuPaymentMethodRaw[];
    const methods = Array.isArray(raw) ? raw : (raw.paymentMethods ?? raw.payment_methods ?? []);
    return methods.map((m) => ({
      id: m.id,
      name: m.name,
      ...(m.logo_url ? { logoUrl: m.logo_url } : {}),
      ...(m.available !== undefined ? { available: m.available } : {}),
    }));
  }

  // -------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------

  private toResult(raw: KhipuPaymentRaw, input?: PaymentLinkInput): PaymentLinkResult {
    const status = mapKhipuStatus(raw.status);
    const result: PaymentLinkResult = {
      paymentId: raw.payment_id,
      paymentUrl: raw.payment_url,
      status,
      amount: raw.amount ?? input?.amount ?? 0,
      currency: raw.currency ?? input?.currency ?? 'CLP',
      subject: raw.subject ?? input?.subject ?? '',
    };
    if (raw.transaction_id) result.externalId = raw.transaction_id;
    else if (input?.externalId) result.externalId = input.externalId;
    if (raw.expires_date) result.expiresAt = raw.expires_date;
    if (raw.conciliation_date) result.paidAt = raw.conciliation_date;
    if (raw.receipt_url) result.receiptUrl = raw.receipt_url;

    const vendorExtras: NonNullable<NonNullable<PaymentLinkResult['vendor']>['khipu']> = {};
    if (raw.simplified_transfer_url)
      vendorExtras.simplifiedTransferUrl = raw.simplified_transfer_url;
    if (raw.transfer_url) vendorExtras.transferUrl = raw.transfer_url;
    if (raw.webpay_url) vendorExtras.webpayUrl = raw.webpay_url;
    if (raw.app_url) vendorExtras.appUrl = raw.app_url;
    if (raw.notification_token) vendorExtras.notificationToken = raw.notification_token;
    if (raw.ready_for_terminal !== undefined)
      vendorExtras.readyForTerminal = raw.ready_for_terminal;
    if (Object.keys(vendorExtras).length > 0) {
      result.vendor = { khipu: vendorExtras };
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
      'x-api-key': this.apiKey,
      Accept: 'application/json',
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
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
      throw new KhipuApiError(extractMessage(parsed, response.status), response.status, parsed);
    }
    return parsed;
  }
}

const extractMessage = (body: unknown, status: number): string => {
  if (body && typeof body === 'object') {
    const obj = body as { message?: unknown; errors?: unknown; status?: unknown };
    if (typeof obj.message === 'string' && obj.message.length > 0) return obj.message;
    if (Array.isArray(obj.errors) && obj.errors.length > 0) {
      const first = obj.errors[0];
      if (typeof first === 'string') return first;
      if (first && typeof first === 'object') {
        const fObj = first as { description?: unknown; field?: unknown };
        if (typeof fObj.description === 'string') {
          return fObj.field ? `${String(fObj.field)}: ${fObj.description}` : fObj.description;
        }
      }
    }
  }
  if (typeof body === 'string' && body.length > 0) return body;
  return `Khipu request failed: ${status}`;
};
