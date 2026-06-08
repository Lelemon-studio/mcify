import { randomToken, sha256Base64Url } from './crypto.js';
import { isValidCodeChallenge, PKCE_METHOD_S256, verifyPkceS256 } from './pkce.js';
import type { OAuthStore, StoredClient } from './store.js';

/**
 * OAuth 2.1 authorization server core. mcify is the server (the agent — Claude — is the client):
 * DCR (RFC 7591), authorization code + PKCE S256 (RFC 7636), refresh with rotation and theft
 * detection. Pure logic over an injected {@link OAuthStore} — fully testable, runtime-agnostic.
 *
 * Port of PlataformaContable's `domain/mcp-oauth.ts`, generalized:
 *  - `userId: string` → opaque `subject: Record<string,string>` (host-defined identity).
 *  - `process.env.APP_PUBLIC_URL` → `resource` injected per request (derived from the origin).
 *  - `node:crypto` → Web Crypto (so `sha256` is async and is awaited throughout).
 *
 * Security invariants (OAuth 2.1):
 *  - PKCE S256 MANDATORY (`plain` and a missing challenge are rejected).
 *  - authorization code single-use (atomic consume) with a ~60s TTL.
 *  - `redirect_uri` exact-matched against the registered set (loopback ignores the port).
 *  - access ~1h; refresh ~30d with rotation; reusing a consumed refresh → revoke the chain.
 *  - tokens/codes hashed (SHA-256) at rest; plaintext only at issuance.
 */

export const DEFAULT_CODE_TTL_MS = 60_000; // 60s
export const DEFAULT_ACCESS_TTL_SECONDS = 3600; // 1h
export const DEFAULT_REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** OAuth error with an `error` code (RFC 6749 §5.2) + a suggested HTTP status for the endpoint. */
export class OAuthError extends Error {
  override readonly name = 'OAuthError';
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope?: string;
}

export interface AccessTokenInfo {
  subject: Record<string, string>;
  clientId: string;
  scope: string | null;
}

export interface OAuthServerConfig {
  readonly store: OAuthStore;
  /** The single protected resource this AS issues tokens for (the MCP endpoint URL). */
  readonly resource: string;
  readonly codeTtlMs?: number;
  readonly accessTtlSeconds?: number;
  readonly refreshTtlMs?: number;
}

// ── Subject (opaque host identity) ─────────────────────────────────────────────

/** Canonical string form of a subject (sorted keys) — the persisted/grouped key. */
export function canonicalSubject(subject: Record<string, string>): string {
  const sorted: Record<string, string> = {};
  for (const k of Object.keys(subject).sort()) sorted[k] = subject[k] as string;
  return JSON.stringify(sorted);
}

function parseSubject(subjectKey: string): Record<string, string> {
  return JSON.parse(subjectKey) as Record<string, string>;
}

// ── DCR (RFC 7591) ──────────────────────────────────────────────────────────────

const MAX_REDIRECT_URIS = 5;
const MAX_URI_LENGTH = 2048;
const MAX_CLIENT_NAME_LENGTH = 256;
const SUPPORTED_GRANT_TYPES = ['authorization_code', 'refresh_token'] as const;
const TOKEN_ENDPOINT_AUTH_METHOD = 'none';
const RESPONSE_TYPES = ['code'] as const;

/** Schemes that may never be a redirect_uri: navigating them enables XSS/exfiltration. */
const DANGEROUS_SCHEMES = new Set(['javascript', 'data', 'vbscript', 'file', 'blob']);

function isLoopback(u: URL): boolean {
  return (
    u.protocol === 'http:' &&
    (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]')
  );
}

/**
 * Validates a `redirect_uri` for DCR. https always; http only on loopback (dev). Native apps
 * (e.g. a custom scheme like `com.anthropic.claude:`) may use a well-formed custom scheme, but
 * NEVER a dangerous one (`javascript:`, `data:`, …).
 */
function isAllowedRedirectUri(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  const scheme = u.protocol.replace(/:$/, '');
  if (DANGEROUS_SCHEMES.has(scheme)) return false;
  if (u.protocol === 'https:') return true;
  if (u.protocol === 'http:') return isLoopback(u);
  return /^[a-z][a-z0-9+.-]*$/.test(scheme) && (u.hostname.length > 0 || u.pathname.length > 0);
}

/**
 * Does the presented `redirect_uri` match a registered one? Exact match, except for loopback:
 * per RFC 8252 §7.3 native apps listen on a random ephemeral port, so for loopback we compare
 * scheme + host + path and **ignore the port**. Everything else is strict equality.
 */
export function redirectUriMatches(registered: readonly string[], presented: string): boolean {
  if (registered.includes(presented)) return true;
  let p: URL;
  try {
    p = new URL(presented);
  } catch {
    return false;
  }
  if (!isLoopback(p)) return false;
  return registered.some((r) => {
    let ru: URL;
    try {
      ru = new URL(r);
    } catch {
      return false;
    }
    return isLoopback(ru) && ru.hostname === p.hostname && ru.pathname === p.pathname;
  });
}

/** Canonical form of a set of strings (order/dupes irrelevant) for comparing client metadata. */
function canonicalSet(values: readonly string[]): string {
  return JSON.stringify([...new Set(values)].sort());
}

export interface ClientRegistration {
  client_id: string;
  client_id_issued_at: number;
  redirect_uris: readonly string[];
  grant_types: readonly string[];
  response_types: readonly string[];
  token_endpoint_auth_method: string;
  client_name?: string;
}

export interface RegisterClientInput {
  clientName?: string;
  redirectUris: readonly string[];
  grantTypes?: readonly string[];
}

export interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  responseType: string;
  scope?: string | null;
  resource?: string | null;
}

export class OAuthServer {
  private readonly store: OAuthStore;
  private readonly resource: string;
  private readonly codeTtlMs: number;
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlMs: number;

  constructor(config: OAuthServerConfig) {
    this.store = config.store;
    this.resource = config.resource;
    this.codeTtlMs = config.codeTtlMs ?? DEFAULT_CODE_TTL_MS;
    this.accessTtlSeconds = config.accessTtlSeconds ?? DEFAULT_ACCESS_TTL_SECONDS;
    this.refreshTtlMs = config.refreshTtlMs ?? DEFAULT_REFRESH_TTL_MS;
  }

  /**
   * RFC 8707 resource indicator. If the client sends `resource`, it must be exactly this MCP
   * endpoint (audience binding → no audience confusion). If absent, accepted (clients that don't
   * send it yet): the token is bound to this single resource regardless.
   */
  validateResource(resource: string | null | undefined): void {
    if (resource && resource !== this.resource) {
      throw new OAuthError('invalid_target', 'The requested resource is not this MCP server');
    }
  }

  private registration(client: StoredClient): ClientRegistration {
    return {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      redirect_uris: client.redirectUris,
      grant_types: client.grantTypes,
      response_types: [...RESPONSE_TYPES],
      token_endpoint_auth_method: client.tokenEndpointAuthMethod,
      ...(client.clientName ? { client_name: client.clientName } : {}),
    };
  }

  /** Dynamic Client Registration. Idempotent: identical metadata returns the existing client. */
  async registerClient(input: RegisterClientInput): Promise<ClientRegistration> {
    const redirectUris = input.redirectUris ?? [];
    if (redirectUris.length === 0) {
      throw new OAuthError('invalid_redirect_uri', 'At least one redirect_uri is required');
    }
    if (redirectUris.length > MAX_REDIRECT_URIS) {
      throw new OAuthError('invalid_redirect_uri', `At most ${MAX_REDIRECT_URIS} redirect_uris`);
    }
    if (input.clientName && input.clientName.length > MAX_CLIENT_NAME_LENGTH) {
      throw new OAuthError('invalid_client_metadata', 'client_name is too long');
    }
    for (const uri of redirectUris) {
      if (uri.length > MAX_URI_LENGTH) {
        throw new OAuthError('invalid_redirect_uri', 'redirect_uri is too long');
      }
      if (!isAllowedRedirectUri(uri)) {
        throw new OAuthError('invalid_redirect_uri', `redirect_uri not allowed: ${uri}`);
      }
    }
    const requested = input.grantTypes?.length ? input.grantTypes : [...SUPPORTED_GRANT_TYPES];
    const grantTypes = requested.filter((g): g is (typeof SUPPORTED_GRANT_TYPES)[number] =>
      (SUPPORTED_GRANT_TYPES as readonly string[]).includes(g),
    );
    if (grantTypes.length === 0) {
      throw new OAuthError('invalid_client_metadata', 'No supported grant_type in the request');
    }
    const clientName = input.clientName ?? null;

    // Idempotent DCR: an existing client with IDENTICAL metadata is returned instead of inserting
    // a duplicate (Claude retries DCR). Hard anti-abuse rate-limiting stays at the network/CDN edge.
    const redirectSig = canonicalSet(redirectUris);
    const grantSig = canonicalSet(grantTypes);
    const existing = (await this.store.findClientsByName(clientName)).find(
      (c) =>
        c.tokenEndpointAuthMethod === TOKEN_ENDPOINT_AUTH_METHOD &&
        canonicalSet(c.redirectUris) === redirectSig &&
        canonicalSet(c.grantTypes) === grantSig,
    );
    if (existing) return this.registration(existing);

    const clientId = `mcp-${randomToken(16)}`;
    const created = await this.store.insertClient({
      clientId,
      clientName,
      redirectUris,
      grantTypes,
      tokenEndpointAuthMethod: TOKEN_ENDPOINT_AUTH_METHOD,
      scope: null,
    });
    return this.registration(created);
  }

  /**
   * Validates an /authorize request before showing consent. Throws `OAuthError` on mismatch.
   * Returns the client (so the caller can show its name on the consent screen).
   */
  async validateAuthorizeRequest(params: AuthorizeParams): Promise<StoredClient> {
    if (params.responseType !== 'code') {
      throw new OAuthError('unsupported_response_type', 'Only response_type=code is supported');
    }
    if (params.codeChallengeMethod !== PKCE_METHOD_S256) {
      throw new OAuthError('invalid_request', 'code_challenge_method=S256 is required');
    }
    if (!isValidCodeChallenge(params.codeChallenge)) {
      throw new OAuthError('invalid_request', 'Invalid code_challenge');
    }
    this.validateResource(params.resource);
    const client = await this.store.getClientById(params.clientId);
    if (!client) throw new OAuthError('invalid_client', 'Unknown client_id', 401);
    if (!redirectUriMatches(client.redirectUris, params.redirectUri)) {
      throw new OAuthError('invalid_request', 'redirect_uri does not match the registered one');
    }
    return client;
  }

  /** Issues a single-use, short-TTL authorization code after the user consents. */
  async issueAuthorizationCode(params: {
    clientId: string;
    subject: Record<string, string>;
    redirectUri: string;
    codeChallenge: string;
    codeChallengeMethod: string;
    scope?: string | null;
  }): Promise<string> {
    const code = randomToken(32);
    await this.store.insertAuthorizationCode({
      codeHash: await sha256Base64Url(code),
      clientId: params.clientId,
      subjectKey: canonicalSubject(params.subject),
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: params.codeChallengeMethod,
      scope: params.scope ?? null,
      expiresAt: new Date(Date.now() + this.codeTtlMs),
    });
    return code;
  }

  /** Shared grant validation: belongs to this client and is not expired. */
  private assertGrantValid(row: { clientId: string; expiresAt: Date }, clientId: string): void {
    if (row.clientId !== clientId) {
      throw new OAuthError('invalid_grant', 'The grant does not belong to this client');
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      throw new OAuthError('invalid_grant', 'The grant has expired');
    }
  }

  private async issueTokenPair(
    subjectKey: string,
    clientId: string,
    scope: string | null,
  ): Promise<{ response: TokenResponse; refreshId: string }> {
    const accessToken = randomToken(32);
    const refreshToken = randomToken(32);
    await this.store.insertAccessToken({
      tokenHash: await sha256Base64Url(accessToken),
      clientId,
      subjectKey,
      scope,
      expiresAt: new Date(Date.now() + this.accessTtlSeconds * 1000),
    });
    const refreshRow = await this.store.insertRefreshToken({
      tokenHash: await sha256Base64Url(refreshToken),
      clientId,
      subjectKey,
      scope,
      expiresAt: new Date(Date.now() + this.refreshTtlMs),
    });
    const response: TokenResponse = {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: this.accessTtlSeconds,
      refresh_token: refreshToken,
      ...(scope ? { scope } : {}),
    };
    return { response, refreshId: refreshRow.id };
  }

  /** grant_type=authorization_code: consume the code, verify PKCE, issue tokens. */
  async exchangeAuthorizationCode(params: {
    code: string;
    clientId: string;
    redirectUri: string;
    codeVerifier: string;
  }): Promise<TokenResponse> {
    if (!params.code || !params.codeVerifier) {
      throw new OAuthError('invalid_request', 'Missing code or code_verifier');
    }
    const row = await this.store.consumeAuthorizationCode(await sha256Base64Url(params.code));
    if (!row) throw new OAuthError('invalid_grant', 'Invalid or already-used code');
    this.assertGrantValid(row, params.clientId);
    if (row.redirectUri !== params.redirectUri) {
      throw new OAuthError('invalid_grant', 'redirect_uri does not match');
    }
    if (!(await verifyPkceS256(params.codeVerifier, row.codeChallenge, row.codeChallengeMethod))) {
      throw new OAuthError('invalid_grant', 'PKCE verification failed');
    }
    const { response } = await this.issueTokenPair(row.subjectKey, row.clientId, row.scope);
    return response;
  }

  /** grant_type=refresh_token: rotate the refresh (atomic single-use) and issue new tokens. */
  async refreshAccessToken(params: {
    refreshToken: string;
    clientId: string;
  }): Promise<TokenResponse> {
    if (!params.refreshToken) throw new OAuthError('invalid_request', 'Missing refresh_token');
    const row = await this.store.getRefreshTokenByHash(await sha256Base64Url(params.refreshToken));
    if (!row) throw new OAuthError('invalid_grant', 'Invalid refresh_token');
    this.assertGrantValid(row, params.clientId);

    // Atomic consume: only the first rotation wins. If already consumed (concurrent reuse or a
    // replayed stolen refresh) → revoke the whole chain (access + refresh for this subject+client).
    const consumed = await this.store.consumeRefreshToken(row.id);
    if (!consumed) {
      await this.store.revokeChain(row.subjectKey, row.clientId);
      throw new OAuthError('invalid_grant', 'refresh_token already used');
    }

    const { response, refreshId } = await this.issueTokenPair(
      row.subjectKey,
      row.clientId,
      row.scope,
    );
    await this.store.setRefreshRotatedTo(row.id, refreshId); // audit link (best-effort)
    return response;
  }

  /** Resolves a Bearer token to its subject/client, or null if invalid/revoked/expired. */
  async verifyAccessToken(token: string): Promise<AccessTokenInfo | null> {
    if (!token) return null;
    const row = await this.store.getAccessTokenByHash(await sha256Base64Url(token));
    if (!row) return null;
    if (row.revokedAt) return null;
    if (row.expiresAt.getTime() <= Date.now()) return null;
    return { subject: parseSubject(row.subjectKey), clientId: row.clientId, scope: row.scope };
  }
}
