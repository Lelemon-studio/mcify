/**
 * Minimal Fintoc API client for open banking (Chile / México).
 *
 * API reference: https://docs.fintoc.com
 *
 * Auth model: an org-level `secret_key` (`sk_live_...` / `sk_test_...`)
 * is sent in the `Authorization` header — literally, without a `Bearer`
 * prefix. Each end-user bank connection produces a `link_token` that
 * scopes movement / account queries to that user's accounts.
 *
 * The connector is *stateless*: the caller resolves the org's
 * `secret_key` and the end-user's `link_token` server-side (see
 * `sessions.ts`) and constructs a fresh `FintocClient` per call. Don't
 * cache it across orgs.
 */

const DEFAULT_BASE_URL = 'https://api.fintoc.com/v1';

/**
 * Default `Fintoc-Version` we pin every request to. Bump in lockstep
 * with a CHANGESET — Fintoc schema changes between versions are not
 * automatically backwards compatible.
 */
export const DEFAULT_FINTOC_VERSION = '2026-02-01';

/** Default page cap when iterating cursors. Protects against runaway loops. */
const DEFAULT_MAX_PAGES = 10;

export interface FintocClientOptions {
  /** Organization secret key (`sk_live_...` or `sk_test_...`). */
  secretKey: string;
  /** Override the API base URL. Defaults to `https://api.fintoc.com/v1`. */
  baseUrl?: string;
  /**
   * Pin the `Fintoc-Version` header. Defaults to
   * {@link DEFAULT_FINTOC_VERSION}. Pass an explicit value to lock a
   * specific org to an older API version during a rollout.
   */
  fintocVersion?: string;
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
  /**
   * Balance values are integers in the smallest unit of `currency`
   * (CLP has no decimals so the value is whole pesos; MXN is in cents).
   */
  balance: { available: number; current: number };
}

export type MovementType = 'transfer' | 'deposit' | 'cash' | 'service_payment' | 'other';

export interface MovementRecord {
  id: string;
  /**
   * Signed integer in the smallest unit of `currency`. Negative for
   * outbound movements (debits). CLP has no decimals; MXN is in cents.
   */
  amount: number;
  currency: string;
  /** Date the movement was posted (settled) by the bank. ISO 8601. */
  postDate: string;
  /**
   * Date the transaction actually occurred. May differ from `postDate`
   * by hours or days for batch-settled movements.
   */
  transactionDate?: string;
  description: string;
  /** Counterparty for outbound movements (we sent money TO this account). */
  recipientAccount?: { holderId: string; holderName: string };
  /** Counterparty for inbound movements (we received money FROM this account). */
  senderAccount?: { holderId: string; holderName: string };
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
  /**
   * Maximum pages to fetch from the cursor. Defaults to {@link DEFAULT_MAX_PAGES}.
   * Use a higher value for deep historical scans; lower for chat-time queries.
   */
  maxPages?: number;
}

export interface RefreshIntentRecord {
  id: string;
  status: 'created' | 'in_progress' | 'succeeded' | 'failed';
  createdAt?: string;
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
  transaction_date?: string;
  description: string;
  recipient_account?: { holder_id: string; holder_name: string };
  sender_account?: { holder_id: string; holder_name: string };
  type: MovementType;
  pending?: boolean;
}

interface FintocRefreshIntentRaw {
  id: string;
  status: RefreshIntentRecord['status'];
  created_at?: string;
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
  ...(raw.transaction_date ? { transactionDate: raw.transaction_date } : {}),
  description: raw.description,
  ...(raw.recipient_account
    ? {
        recipientAccount: {
          holderId: raw.recipient_account.holder_id,
          holderName: raw.recipient_account.holder_name,
        },
      }
    : {}),
  ...(raw.sender_account
    ? {
        senderAccount: {
          holderId: raw.sender_account.holder_id,
          holderName: raw.sender_account.holder_name,
        },
      }
    : {}),
  type: raw.type,
  ...(typeof raw.pending === 'boolean' ? { pending: raw.pending } : {}),
});

const toRefreshIntent = (raw: FintocRefreshIntentRaw): RefreshIntentRecord => ({
  id: raw.id,
  status: raw.status,
  ...(raw.created_at ? { createdAt: raw.created_at } : {}),
});

/**
 * Parse the `Link` HTTP header (RFC 5988) and extract the URL with
 * `rel="next"`, if any. Fintoc returns this on every paginated GET.
 *
 * Example header: `<https://api.fintoc.com/v1/...?page=2>; rel="next"`
 */
const parseNextUrl = (linkHeader: string | null): string | null => {
  if (!linkHeader) return null;
  // Multiple links may be comma-separated.
  for (const part of linkHeader.split(',')) {
    const match = part.trim().match(/^<([^>]+)>\s*;\s*rel=(?:"next"|next)$/);
    if (match) return match[1] ?? null;
  }
  return null;
};

interface RequestResult {
  data: unknown;
  linkHeader: string | null;
}

export class FintocClient {
  private readonly secretKey: string;
  private readonly baseUrl: string;
  private readonly fintocVersion: string;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(options: FintocClientOptions) {
    if (!options.secretKey) {
      throw new TypeError('FintocClient: `secretKey` is required');
    }
    this.secretKey = options.secretKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.fintocVersion = options.fintocVersion ?? DEFAULT_FINTOC_VERSION;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  async listAccounts(linkToken: string): Promise<AccountRecord[]> {
    const search = new URLSearchParams({ link_token: linkToken });
    const { data } = await this.request('GET', `/accounts?${search.toString()}`);
    return (data as FintocAccountRaw[]).map(toAccount);
  }

  async getAccount(linkToken: string, accountId: string): Promise<AccountRecord> {
    const search = new URLSearchParams({ link_token: linkToken });
    const { data } = await this.request(
      'GET',
      `/accounts/${encodeURIComponent(accountId)}?${search.toString()}`,
    );
    return toAccount(data as FintocAccountRaw);
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

    const maxPages = params.maxPages ?? DEFAULT_MAX_PAGES;
    let pageUrl: string | null =
      `/accounts/${encodeURIComponent(accountId)}/movements?${search.toString()}`;
    const collected: MovementRecord[] = [];

    for (let pages = 0; pageUrl && pages < maxPages; pages++) {
      const { data, linkHeader } = await this.requestAbsolute('GET', pageUrl);
      for (const raw of data as FintocMovementRaw[]) {
        collected.push(toMovement(raw));
      }
      pageUrl = parseNextUrl(linkHeader);
    }

    return collected;
  }

  /**
   * Trigger an on-demand refresh of movements for a Link. Fintoc
   * processes the refresh asynchronously — the returned record's
   * `status` may still be `'created'` or `'in_progress'`. Subscribe to
   * `refresh_intent.succeeded` / `refresh_intent.failed` webhooks to
   * detect completion.
   *
   * Endpoint: `POST /v1/refresh_intents` with body `{ link_token }`.
   */
  async createRefreshIntent(linkToken: string): Promise<RefreshIntentRecord> {
    const { data } = await this.request('POST', `/refresh_intents`, { link_token: linkToken });
    return toRefreshIntent(data as FintocRefreshIntentRaw);
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<RequestResult> {
    return this.requestAbsolute(method, `${this.baseUrl}${path}`, body);
  }

  private async requestAbsolute(
    method: 'GET' | 'POST',
    urlOrPath: string,
    body?: unknown,
  ): Promise<RequestResult> {
    // Accept either an absolute URL (when following a Link header) or
    // a path (when called directly). Path-only inputs get the base URL
    // prepended; absolute URLs pass through.
    const url = urlOrPath.startsWith('http') ? urlOrPath : `${this.baseUrl}${urlOrPath}`;

    const headers: Record<string, string> = {
      // Fintoc uses the secret key directly in Authorization — no `Bearer` prefix.
      Authorization: this.secretKey,
      Accept: 'application/json',
      'Fintoc-Version': this.fintocVersion,
    };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

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

    return { data: parsed, linkHeader: response.headers.get('Link') };
  }
}

const extractErrorMessage = (error: unknown): string => {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Fintoc request failed';
};
