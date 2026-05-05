/**
 * Minimal Khipu API client. Handles auth, base URL, and JSON parsing —
 * deliberately small so the connector code stays readable.
 *
 * API reference: https://docs.khipu.com/portal/en/kb/khipu-api
 */

export interface KhipuClientOptions {
  /** API key from your Khipu merchant dashboard. */
  apiKey: string;
  /**
   * Override the API base URL. Useful for sandbox / fixture servers.
   * Defaults to `https://payment-api.khipu.com/v3`.
   */
  baseUrl?: string;
  /**
   * Inject a `fetch` implementation. Defaults to `globalThis.fetch`.
   * Tests pass a mock here.
   */
  fetch?: typeof globalThis.fetch;
}

export interface CreatePaymentInput {
  subject: string;
  currency: 'CLP' | 'USD';
  amount: number;
  /** Free-form merchant transaction id. */
  transactionId?: string;
  body?: string;
  returnUrl?: string;
  cancelUrl?: string;
  notifyUrl?: string;
}

export interface CreatePaymentResult {
  paymentId: string;
  paymentUrl: string;
  simplifiedTransferUrl?: string;
  appUrl?: string;
  readyForTerminal: boolean;
  expiresDate?: string;
}

export type PaymentStatus = 'pending' | 'verifying' | 'done' | 'committed' | 'failed' | 'rejected';

export interface PaymentDetail {
  paymentId: string;
  status: PaymentStatus;
  statusDetail?: string;
  subject: string;
  currency: string;
  amount: number;
  transactionId?: string;
  receiptUrl?: string;
  pictureUrl?: string;
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

const DEFAULT_BASE_URL = 'https://payment-api.khipu.com/v3';

/** Minimal Khipu API client used by the example MCP tools. */
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

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const response = await this.request('POST', '/payments', {
      subject: input.subject,
      currency: input.currency,
      amount: input.amount,
      ...(input.transactionId ? { transaction_id: input.transactionId } : {}),
      ...(input.body ? { body: input.body } : {}),
      ...(input.returnUrl ? { return_url: input.returnUrl } : {}),
      ...(input.cancelUrl ? { cancel_url: input.cancelUrl } : {}),
      ...(input.notifyUrl ? { notify_url: input.notifyUrl } : {}),
    });
    return {
      paymentId: response['payment_id'] as string,
      paymentUrl: response['payment_url'] as string,
      ...(typeof response['simplified_transfer_url'] === 'string'
        ? { simplifiedTransferUrl: response['simplified_transfer_url'] }
        : {}),
      ...(typeof response['app_url'] === 'string' ? { appUrl: response['app_url'] } : {}),
      readyForTerminal: Boolean(response['ready_for_terminal']),
      ...(typeof response['expires_date'] === 'string'
        ? { expiresDate: response['expires_date'] }
        : {}),
    };
  }

  async getPayment(paymentId: string): Promise<PaymentDetail> {
    const response = await this.request('GET', `/payments/${encodeURIComponent(paymentId)}`);
    return {
      paymentId: response['payment_id'] as string,
      status: response['status'] as PaymentStatus,
      ...(typeof response['status_detail'] === 'string'
        ? { statusDetail: response['status_detail'] }
        : {}),
      subject: response['subject'] as string,
      currency: response['currency'] as string,
      amount: Number(response['amount']),
      ...(typeof response['transaction_id'] === 'string'
        ? { transactionId: response['transaction_id'] }
        : {}),
      ...(typeof response['receipt_url'] === 'string'
        ? { receiptUrl: response['receipt_url'] }
        : {}),
      ...(typeof response['picture_url'] === 'string'
        ? { pictureUrl: response['picture_url'] }
        : {}),
    };
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const url = `${this.baseUrl}${path}`;
    const init: RequestInit = {
      method,
      headers: {
        'x-api-key': this.apiKey,
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    };

    const response = await this.fetchImpl(url, init);
    const text = await response.text();
    let parsed: unknown = text;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        // Khipu always returns JSON for valid responses; if parsing fails,
        // the body itself is the most useful debug surface.
        parsed = text;
      }
    }

    if (!response.ok) {
      const message =
        parsed && typeof parsed === 'object' && 'message' in parsed
          ? String((parsed as { message: unknown }).message)
          : `Khipu request failed: ${response.status}`;
      throw new KhipuApiError(message, response.status, parsed);
    }

    return parsed as Record<string, unknown>;
  }
}
