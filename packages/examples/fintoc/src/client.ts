/**
 * Minimal Fintoc API client for open banking (Chile / México).
 *
 * API reference: https://docs.fintoc.com
 *
 * Auth model: a `secret_key` (sk_live_... / sk_test_...) is the
 * organization-level API key, sent in the `Authorization` header. Each
 * end-user bank connection produces a `link_token` that scopes requests
 * to that user's accounts.
 */

const DEFAULT_BASE_URL = 'https://api.fintoc.com/v1';

export interface FintocClientOptions {
  /** Organization secret key (sk_live_... or sk_test_...). */
  secretKey: string;
  /** Override the API base URL. Defaults to https://api.fintoc.com/v1. */
  baseUrl?: string;
  /** Inject a fetch implementation. Tests pass a mock here. */
  fetch?: typeof globalThis.fetch;
}

export interface AccountRecord {
  id: string;
  name: string;
  officialName?: string;
  number: string;
  holderId: string;
  holderName: string;
  type: 'checking_account' | 'sight_account' | 'savings_account' | 'business_account';
  currency: string;
  balance: { available: number; current: number };
}

export type MovementType = 'transfer' | 'deposit' | 'cash' | 'service_payment' | 'other';

export interface MovementRecord {
  id: string;
  amount: number;
  currency: string;
  postDate: string;
  description: string;
  /** Counterparty's full name when available. */
  recipientAccount?: { holderId: string; holderName: string };
  type: MovementType;
  pending?: boolean;
}

export interface ListMovementsParams {
  /** Inclusive lower bound (YYYY-MM-DD). */
  since?: string;
  /** Inclusive upper bound (YYYY-MM-DD). */
  until?: string;
  /** Page size, max 300. */
  perPage?: number;
}

export class FintocApiError extends Error {
  override readonly name = 'FintocApiError';
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
  }
}

interface FintocAccountRaw {
  id: string;
  name: string;
  official_name?: string;
  number: string;
  holder_id: string;
  holder_name: string;
  type: AccountRecord['type'];
  currency: string;
  balance: { available: number; current: number };
}

interface FintocMovementRaw {
  id: string;
  amount: number;
  currency: string;
  post_date: string;
  description: string;
  recipient_account?: { holder_id: string; holder_name: string };
  type: MovementType;
  pending?: boolean;
}

const toAccount = (raw: FintocAccountRaw): AccountRecord => ({
  id: raw.id,
  name: raw.name,
  ...(raw.official_name ? { officialName: raw.official_name } : {}),
  number: raw.number,
  holderId: raw.holder_id,
  holderName: raw.holder_name,
  type: raw.type,
  currency: raw.currency,
  balance: { available: raw.balance.available, current: raw.balance.current },
});

const toMovement = (raw: FintocMovementRaw): MovementRecord => ({
  id: raw.id,
  amount: raw.amount,
  currency: raw.currency,
  postDate: raw.post_date,
  description: raw.description,
  ...(raw.recipient_account
    ? {
        recipientAccount: {
          holderId: raw.recipient_account.holder_id,
          holderName: raw.recipient_account.holder_name,
        },
      }
    : {}),
  type: raw.type,
  ...(typeof raw.pending === 'boolean' ? { pending: raw.pending } : {}),
});

export class FintocClient {
  private readonly secretKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(options: FintocClientOptions) {
    if (!options.secretKey) {
      throw new TypeError('FintocClient: `secretKey` is required');
    }
    this.secretKey = options.secretKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  async listAccounts(linkToken: string): Promise<AccountRecord[]> {
    const search = new URLSearchParams({ link_token: linkToken });
    const raw = (await this.request('GET', `/accounts?${search.toString()}`)) as FintocAccountRaw[];
    return raw.map(toAccount);
  }

  async getAccount(linkToken: string, accountId: string): Promise<AccountRecord> {
    const search = new URLSearchParams({ link_token: linkToken });
    const raw = (await this.request(
      'GET',
      `/accounts/${encodeURIComponent(accountId)}?${search.toString()}`,
    )) as FintocAccountRaw;
    return toAccount(raw);
  }

  async listMovements(
    linkToken: string,
    accountId: string,
    params: ListMovementsParams = {},
  ): Promise<MovementRecord[]> {
    const search = new URLSearchParams({ link_token: linkToken });
    if (params.since) search.set('since', params.since);
    if (params.until) search.set('until', params.until);
    if (params.perPage) search.set('per_page', String(params.perPage));

    const raw = (await this.request(
      'GET',
      `/accounts/${encodeURIComponent(accountId)}/movements?${search.toString()}`,
    )) as FintocMovementRaw[];
    return raw.map(toMovement);
  }

  private async request(method: 'GET', path: string): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const init: RequestInit = {
      method,
      headers: {
        // Fintoc uses the secret key directly in the Authorization header
        // — no `Bearer` prefix.
        Authorization: this.secretKey,
        accept: 'application/json',
      },
    };

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
      const message =
        parsed && typeof parsed === 'object' && 'error' in parsed
          ? extractErrorMessage((parsed as { error: unknown }).error)
          : `Fintoc request failed: ${response.status}`;
      throw new FintocApiError(message, response.status, parsed);
    }

    return parsed;
  }
}

const extractErrorMessage = (error: unknown): string => {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Fintoc request failed';
};
