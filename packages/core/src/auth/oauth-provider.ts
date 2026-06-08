import type { AuthConfig } from './types.js';
import type { OAuthStore } from './oauth/store.js';

/**
 * The host's identity + consent decision for an /authorize request. mcify has already validated
 * the OAuth mechanics (PKCE, redirect_uri, client); this hook answers *who* is authorizing:
 *  - `authenticated` — the host has a session (and any consent, e.g. project selection) → bind
 *    the opaque `subject` to the issued token. mcify never interprets `subject`; it reappears as
 *    `ctx.auth.subject` in tools.
 *  - `redirect` — no session yet → send the user to the host's login/consent page, which returns
 *    to /authorize once a session cookie is set.
 */
export type AuthorizeDecision =
  | { readonly status: 'authenticated'; readonly subject: Record<string, string> }
  | { readonly status: 'redirect'; readonly url: string };

export interface OAuthProviderOptions {
  /**
   * Issuer base URL (https). Used to build the well-known metadata and the token audience.
   * If omitted, it is derived from the incoming request's origin (robust on edge runtimes
   * where there is no reliable env var).
   */
  readonly issuer?: string;
  /** Persistence for clients/codes/tokens. {@link MemoryOAuthStore} for dev; bring your own in prod. */
  readonly store: OAuthStore;
  /** Identity + consent hook owned by the host. Called during /authorize. */
  readonly authorize: (request: Request) => Promise<AuthorizeDecision> | AuthorizeDecision;
  /** Access-token lifetime in seconds. Default 3600 (1h). */
  readonly accessTtlSeconds?: number;
  /** Authorization-code lifetime in seconds. Default 60. */
  readonly codeTtlSeconds?: number;
  /** Refresh-token lifetime in days. Default 30. */
  readonly refreshTtlDays?: number;
  /** Human-readable name surfaced in protected-resource metadata. */
  readonly resourceName?: string;
}

/**
 * Configure mcify as its own **OAuth 2.1 authorization server** — the "Connect Claude" experience:
 * the agent discovers the server from a 401, registers (DCR), the user approves in the browser, and
 * the agent gets a token. mcify mounts the OAuth endpoints and validates tokens; the host supplies
 * a {@link OAuthStore} and an {@link OAuthProviderOptions.authorize} hook.
 *
 * Distinct from {@link oauth} (which *delegates* to an external IdP and verifies its JWTs).
 *
 * @example
 * ```ts
 * auth: oauthProvider({
 *   issuer: process.env.MCIFY_ISSUER,
 *   store: new MemoryOAuthStore(),
 *   authorize: async (req) => {
 *     const session = await readSession(req);
 *     if (!session) return { status: 'redirect', url: `${DASHBOARD}/consent?...` };
 *     return { status: 'authenticated', subject: { userId: session.userId } };
 *   },
 * }),
 * ```
 */
export function oauthProvider(
  opts: OAuthProviderOptions,
): Extract<AuthConfig, { type: 'oauth_provider' }> {
  if (!opts.store) throw new TypeError('oauthProvider: `store` is required');
  if (typeof opts.authorize !== 'function') {
    throw new TypeError('oauthProvider: `authorize` hook is required');
  }
  if (opts.issuer && !/^https?:\/\//.test(opts.issuer)) {
    throw new TypeError('oauthProvider: `issuer` must be an absolute http(s) URL');
  }
  return {
    type: 'oauth_provider',
    store: opts.store,
    authorize: opts.authorize,
    ...(opts.issuer ? { issuer: opts.issuer } : {}),
    ...(opts.accessTtlSeconds !== undefined ? { accessTtlSeconds: opts.accessTtlSeconds } : {}),
    ...(opts.codeTtlSeconds !== undefined ? { codeTtlSeconds: opts.codeTtlSeconds } : {}),
    ...(opts.refreshTtlDays !== undefined ? { refreshTtlDays: opts.refreshTtlDays } : {}),
    ...(opts.resourceName !== undefined ? { resourceName: opts.resourceName } : {}),
  };
}
