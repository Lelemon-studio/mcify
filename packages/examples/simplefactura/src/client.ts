/**
 * Minimal SimpleFactura API client (Chile electronic invoicing).
 *
 * API reference: https://documentacion.simplefactura.cl
 * Auditoría completa: clients/lelemon/research/simplefactura-api.md
 *
 * Auth model: JWT obtained via `POST /token` with email + password,
 * cached until `expiresAt`, then auto-refreshed. The bearer is sent
 * literally as `Authorization: Bearer <jwt>`.
 *
 * Multi-empresa: SimpleFactura's quirk is that one user account can
 * operate many companies. Each business endpoint receives a
 * `Credenciales` object in the body that names which company to act
 * on (`rutEmisor`). The client doesn't manage the Credenciales — that
 * is done by the SessionStore + tools layer to keep secrets out of
 * the LLM input.
 *
 * The client is *stateless across orgs*: construct a fresh
 * SimpleFacturaClient per request using the org's session, do the
 * call, and let the SessionStore persist any updated token.
 */

const DEFAULT_BASE_URL = 'https://api.simplefactura.cl';

export interface SimpleFacturaTokenCache {
  accessToken: string;
  /** ISO 8601 timestamp. The client refreshes when `Date.now()` >= expiresAtMs. */
  expiresAt: string;
}

export interface SimpleFacturaClientOptions {
  email: string;
  password: string;
  /** Optional pre-existing token (from SessionStore). Avoids a refresh on first call. */
  cachedToken?: SimpleFacturaTokenCache;
  /** Override the API base URL. Defaults to https://api.simplefactura.cl. */
  baseUrl?: string;
  /** Inject a fetch implementation. Tests pass a mock here. */
  fetch?: typeof globalThis.fetch;
  /**
   * Called whenever the client refreshes its token. Use it to persist the
   * new `{ accessToken, expiresAt }` back into the SessionStore so the
   * next request across orgs benefits from the cache.
   */
  onTokenRefreshed?: (token: SimpleFacturaTokenCache) => void | Promise<void>;
  /**
   * Skew in milliseconds applied when checking expiration — the client
   * refreshes if the token expires within this window. Defaults to 60s.
   */
  refreshSkewMs?: number;
}

export class SimpleFacturaApiError extends Error {
  override readonly name = 'SimpleFacturaApiError';
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
    public readonly errors?: string[],
  ) {
    super(message);
  }
}

interface TokenResponse {
  accessToken: string;
  expiresAt: string;
  expiresIn?: number;
}

/**
 * SimpleFactura wraps every business response in this envelope.
 * `status` is HTTP-style (200 = OK), and `data` is the actual payload.
 * Errors come back as a non-2xx HTTP status AND/OR an envelope with
 * `errors[]` populated — the client surfaces both via SimpleFacturaApiError.
 */
export interface SimpleFacturaEnvelope<T> {
  status: number;
  message?: string;
  data: T;
  errors?: string[];
}

export class SimpleFacturaClient {
  private readonly email: string;
  private readonly password: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly onTokenRefreshed?: (token: SimpleFacturaTokenCache) => void | Promise<void>;
  private readonly refreshSkewMs: number;

  private cachedToken: SimpleFacturaTokenCache | undefined;
  private inFlightRefresh: Promise<string> | null = null;

  constructor(options: SimpleFacturaClientOptions) {
    if (!options.email || !options.password) {
      throw new TypeError('SimpleFacturaClient: `email` and `password` are required');
    }
    this.email = options.email;
    this.password = options.password;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    if (options.onTokenRefreshed) this.onTokenRefreshed = options.onTokenRefreshed;
    this.refreshSkewMs = options.refreshSkewMs ?? 60_000;
    this.cachedToken = options.cachedToken;
  }

  /**
   * Read the currently cached token (if any). Tools and SessionStore
   * use this to persist back across requests.
   */
  getCachedToken(): SimpleFacturaTokenCache | undefined {
    return this.cachedToken ? { ...this.cachedToken } : undefined;
  }

  async post<TBody, TResp>(path: string, body: TBody): Promise<SimpleFacturaEnvelope<TResp>> {
    return this.request<TResp>('POST', path, body);
  }

  /**
   * POST that returns a binary payload (PDF/XML). Surfaces the bytes
   * directly — non-2xx responses still throw SimpleFacturaApiError.
   */
  async postForBytes<TBody>(path: string, body: TBody): Promise<Uint8Array> {
    const token = await this.getValidToken();
    const url = `${this.baseUrl}${path}`;
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      await this.throwApiError(response);
    }
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<SimpleFacturaEnvelope<T>> {
    const token = await this.getValidToken();
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    const response = await this.fetchImpl(url, init);

    // 401 with a cached token → token may have been revoked server-side.
    // Force a refresh and retry once.
    if (response.status === 401 && this.cachedToken) {
      this.cachedToken = undefined;
      const fresh = await this.getValidToken();
      headers.Authorization = `Bearer ${fresh}`;
      const retry = await this.fetchImpl(url, init);
      return this.parseEnvelope<T>(retry);
    }

    return this.parseEnvelope<T>(response);
  }

  private async parseEnvelope<T>(response: Response): Promise<SimpleFacturaEnvelope<T>> {
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
      this.throwFromBody(response.status, parsed);
    }
    if (parsed && typeof parsed === 'object' && 'data' in parsed) {
      return parsed as SimpleFacturaEnvelope<T>;
    }
    // Endpoint returned a bare body (rare). Wrap to keep callers uniform.
    return { status: response.status, data: parsed as T };
  }

  private async throwApiError(response: Response): Promise<never> {
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // keep raw
    }
    this.throwFromBody(response.status, parsed);
  }

  private throwFromBody(status: number, body: unknown): never {
    const message = extractMessage(body, status);
    const errors = extractErrors(body);
    throw new SimpleFacturaApiError(message, status, body, errors);
  }

  private async getValidToken(): Promise<string> {
    if (this.cachedToken && !this.isExpiring(this.cachedToken)) {
      return this.cachedToken.accessToken;
    }
    if (this.inFlightRefresh) return this.inFlightRefresh;

    this.inFlightRefresh = this.refreshToken().finally(() => {
      this.inFlightRefresh = null;
    });
    return this.inFlightRefresh;
  }

  private isExpiring(token: SimpleFacturaTokenCache): boolean {
    const expiresAtMs = Date.parse(token.expiresAt);
    if (Number.isNaN(expiresAtMs)) return true;
    return Date.now() + this.refreshSkewMs >= expiresAtMs;
  }

  private async refreshToken(): Promise<string> {
    const url = `${this.baseUrl}/token`;
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });
    const text = await response.text();
    let parsed: unknown = text;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        // keep raw
      }
    }
    if (!response.ok) {
      const message = extractMessage(parsed, response.status);
      throw new SimpleFacturaApiError(message, response.status, parsed);
    }
    const tokenResponse = parsed as Partial<TokenResponse>;
    if (!tokenResponse.accessToken || !tokenResponse.expiresAt) {
      throw new SimpleFacturaApiError(
        'SimpleFactura /token response missing accessToken or expiresAt',
        response.status,
        parsed,
      );
    }

    this.cachedToken = {
      accessToken: tokenResponse.accessToken,
      expiresAt: tokenResponse.expiresAt,
    };
    if (this.onTokenRefreshed) {
      await this.onTokenRefreshed({ ...this.cachedToken });
    }
    return this.cachedToken.accessToken;
  }
}

const extractMessage = (body: unknown, status: number): string => {
  if (body && typeof body === 'object') {
    const obj = body as { message?: unknown; title?: unknown; errors?: unknown };
    // SimpleFactura envelope: `{ status, message, data, errors: [string] }`.
    if (typeof obj.message === 'string' && obj.message.length > 0) return obj.message;
    // Array of error strings (envelope shape).
    if (Array.isArray(obj.errors) && obj.errors.length > 0) {
      const first = obj.errors[0];
      if (typeof first === 'string') return first;
    }
    // ASP.NET Core ProblemDetails: `{ title, status, errors: { Field: [msg] } }`.
    if (obj.errors && typeof obj.errors === 'object' && !Array.isArray(obj.errors)) {
      const errs = obj.errors as Record<string, unknown>;
      const firstKey = Object.keys(errs)[0];
      if (firstKey) {
        const arr = errs[firstKey];
        if (Array.isArray(arr) && typeof arr[0] === 'string') {
          return `${firstKey}: ${arr[0] as string}`;
        }
      }
    }
    if (typeof obj.title === 'string' && obj.title.length > 0) return obj.title;
  }
  if (typeof body === 'string' && body.length > 0) return body;
  return `SimpleFactura request failed: ${status}`;
};

const extractErrors = (body: unknown): string[] | undefined => {
  if (body && typeof body === 'object') {
    const errors = (body as { errors?: unknown }).errors;
    // Envelope: `errors: [string]`.
    if (Array.isArray(errors) && errors.every((e) => typeof e === 'string')) {
      return errors as string[];
    }
    // ProblemDetails: `errors: { Field: [msg] }` — flatten.
    if (errors && typeof errors === 'object' && !Array.isArray(errors)) {
      const flat: string[] = [];
      for (const [field, msgs] of Object.entries(errors as Record<string, unknown>)) {
        if (Array.isArray(msgs)) {
          for (const m of msgs) {
            if (typeof m === 'string') flat.push(`${field}: ${m}`);
          }
        }
      }
      if (flat.length > 0) return flat;
    }
  }
  return undefined;
};
