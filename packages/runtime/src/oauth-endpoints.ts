import type { Hono, Context } from 'hono';
import { OAuthError, OAuthServer, type AuthConfig, type AuthState, type Logger } from '@mcify/core';

/**
 * HTTP wiring for the first-party OAuth 2.1 authorization server (`oauthProvider()`). Mounts the
 * discovery + OAuth endpoints on the Hono app and resolves Bearer tokens for the MCP route:
 *
 *   GET  /.well-known/oauth-protected-resource   (RFC 9728)
 *   GET  /.well-known/oauth-authorization-server (RFC 8414)
 *   POST /register                               (RFC 7591 DCR)
 *   GET  /authorize                              (consent round-trip via the host hook)
 *   POST /token                                  (authorization_code + refresh_token)
 *   POST {mcpPath} without a token → 401 + WWW-Authenticate(resource_metadata)
 *
 * The AS core (crypto, store, token issuance) lives in `@mcify/core`; this file is the transport
 * adapter. An `OAuthServer` is built per request, cheap: the store is injected and `resource` is
 * derived from the issuer (config or request origin).
 */

export type OAuthProviderConfig = Extract<AuthConfig, { type: 'oauth_provider' }>;

export function isOAuthProvider(auth: AuthConfig | undefined): auth is OAuthProviderConfig {
  return auth?.type === 'oauth_provider';
}

const NO_STORE = { 'Cache-Control': 'no-store', Pragma: 'no-cache' } as const;
const PUBLIC_1H = { 'Cache-Control': 'public, max-age=3600' } as const;

/** Resolve the issuer: explicit config wins; otherwise derive from the (proxy-aware) request origin. */
function resolveIssuer(c: Context, configIssuer: string | undefined): string {
  if (configIssuer) return configIssuer.replace(/\/$/, '');
  const url = new URL(c.req.url);
  const proto = c.req.header('x-forwarded-proto') ?? url.protocol.replace(/:$/, '');
  const host = c.req.header('x-forwarded-host') ?? c.req.header('host') ?? url.host;
  return `${proto}://${host}`;
}

function buildServer(c: Context, cfg: OAuthProviderConfig, resource: string): OAuthServer {
  return new OAuthServer({
    store: cfg.store,
    resource,
    ...(cfg.codeTtlSeconds !== undefined ? { codeTtlMs: cfg.codeTtlSeconds * 1000 } : {}),
    ...(cfg.accessTtlSeconds !== undefined ? { accessTtlSeconds: cfg.accessTtlSeconds } : {}),
    ...(cfg.refreshTtlDays !== undefined
      ? { refreshTtlMs: cfg.refreshTtlDays * 24 * 60 * 60 * 1000 }
      : {}),
  });
}

const oauthErrorJson = (c: Context, e: unknown, logger: Logger) => {
  if (e instanceof OAuthError) {
    return c.json({ error: e.code, error_description: e.message }, e.status as 400 | 401, NO_STORE);
  }
  logger.error('oauth endpoint failed', { error: e instanceof Error ? e.message : String(e) });
  return c.json({ error: 'server_error', error_description: 'internal error' }, 500, NO_STORE);
};

export interface MountOAuthOptions {
  readonly mcpPath: string;
  readonly logger: Logger;
}

/** Registers the OAuth + discovery endpoints on the app. The MCP route 401 is handled in http.ts. */
export function mountOAuthEndpoints(
  app: Hono,
  cfg: OAuthProviderConfig,
  { mcpPath, logger }: MountOAuthOptions,
): void {
  const resourceUrl = (c: Context) => `${resolveIssuer(c, cfg.issuer)}${mcpPath}`;

  // ── RFC 9728: protected-resource metadata ────────────────────────────────
  app.get('/.well-known/oauth-protected-resource', (c) => {
    const issuer = resolveIssuer(c, cfg.issuer);
    return c.json(
      {
        resource: `${issuer}${mcpPath}`,
        authorization_servers: [issuer],
        bearer_methods_supported: ['header'],
        scopes_supported: [],
        ...(cfg.resourceName ? { resource_name: cfg.resourceName } : {}),
      },
      200,
      PUBLIC_1H,
    );
  });

  // ── RFC 8414: authorization-server metadata ──────────────────────────────
  app.get('/.well-known/oauth-authorization-server', (c) => {
    const issuer = resolveIssuer(c, cfg.issuer);
    return c.json(
      {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        registration_endpoint: `${issuer}/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
        scopes_supported: [],
      },
      200,
      PUBLIC_1H,
    );
  });

  // ── RFC 7591: Dynamic Client Registration ────────────────────────────────
  app.post('/register', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        { error: 'invalid_client_metadata', error_description: 'Invalid JSON body' },
        400,
        NO_STORE,
      );
    }
    const b = (body ?? {}) as Record<string, unknown>;
    const redirectUris = Array.isArray(b['redirect_uris'])
      ? b['redirect_uris'].filter((u): u is string => typeof u === 'string')
      : [];
    const clientName = typeof b['client_name'] === 'string' ? b['client_name'] : undefined;
    const grantTypes = Array.isArray(b['grant_types'])
      ? b['grant_types'].filter((g): g is string => typeof g === 'string')
      : undefined;
    try {
      const as = buildServer(c, cfg, resourceUrl(c));
      const reg = await as.registerClient({
        redirectUris,
        ...(clientName !== undefined ? { clientName } : {}),
        ...(grantTypes !== undefined ? { grantTypes } : {}),
      });
      return c.json(reg, 201, NO_STORE);
    } catch (e) {
      return oauthErrorJson(c, e, logger);
    }
  });

  // ── /authorize: validate → host identity/consent hook → issue code ───────
  app.get('/authorize', async (c) => {
    const q = c.req.query();
    const as = buildServer(c, cfg, resourceUrl(c));
    let client;
    try {
      client = await as.validateAuthorizeRequest({
        clientId: q['client_id'] ?? '',
        redirectUri: q['redirect_uri'] ?? '',
        codeChallenge: q['code_challenge'] ?? '',
        codeChallengeMethod: q['code_challenge_method'] ?? '',
        responseType: q['response_type'] ?? '',
        scope: q['scope'] ?? null,
        resource: q['resource'] ?? null,
      });
    } catch (e) {
      // Pre-consent failures (bad client/redirect/PKCE) are shown directly — NOT redirected,
      // since an unvalidated redirect_uri must never receive the error (open-redirect/leak).
      return oauthErrorJson(c, e, logger);
    }

    // Identity + consent is the host's job. mcify hands it the raw request (cookies and all).
    let decision;
    try {
      decision = await cfg.authorize(c.req.raw);
    } catch (e) {
      logger.error('authorize hook threw', { error: e instanceof Error ? e.message : String(e) });
      return c.json({ error: 'access_denied', error_description: 'consent failed' }, 403, NO_STORE);
    }

    if (decision.status === 'redirect') {
      return c.redirect(decision.url, 302);
    }

    // Authenticated → mint a single-use code bound to the host subject, bounce to the client.
    const code = await as.issueAuthorizationCode({
      clientId: client.clientId,
      subject: decision.subject,
      redirectUri: q['redirect_uri'] ?? '',
      codeChallenge: q['code_challenge'] ?? '',
      codeChallengeMethod: q['code_challenge_method'] ?? 'S256',
      scope: q['scope'] ?? null,
    });
    const back = new URL(q['redirect_uri'] ?? '');
    back.searchParams.set('code', code);
    if (q['state']) back.searchParams.set('state', q['state']);
    return c.redirect(back.toString(), 302);
  });

  // ── /token: authorization_code + refresh_token (form-urlencoded) ─────────
  app.post('/token', async (c) => {
    let form: Record<string, string>;
    try {
      const parsed = await c.req.parseBody();
      form = Object.fromEntries(
        Object.entries(parsed).map(([k, v]) => [k, typeof v === 'string' ? v : '']),
      );
    } catch {
      return c.json({ error: 'invalid_request', error_description: 'Invalid body' }, 400, NO_STORE);
    }
    const get = (k: string) => form[k] ?? '';
    const as = buildServer(c, cfg, resourceUrl(c));
    try {
      const clientId = get('client_id');
      if (!clientId) throw new OAuthError('invalid_client', 'Missing client_id', 401);
      // RFC 8707: if the client sends `resource`, it must be this MCP server (audience binding).
      as.validateResource(get('resource') || null);

      const grantType = get('grant_type');
      if (grantType === 'authorization_code') {
        const tokens = await as.exchangeAuthorizationCode({
          code: get('code'),
          clientId,
          redirectUri: get('redirect_uri'),
          codeVerifier: get('code_verifier'),
        });
        return c.json(tokens, 200, NO_STORE);
      }
      if (grantType === 'refresh_token') {
        const tokens = await as.refreshAccessToken({
          refreshToken: get('refresh_token'),
          clientId,
        });
        return c.json(tokens, 200, NO_STORE);
      }
      throw new OAuthError(
        'unsupported_grant_type',
        `Unsupported grant_type: ${grantType || '(empty)'}`,
      );
    } catch (e) {
      return oauthErrorJson(c, e, logger);
    }
  });
}

/**
 * Resolve the Bearer token on the MCP route into an `AuthState`, or `null` when absent/invalid
 * (the caller answers 401 + WWW-Authenticate). Returns a 401 challenge header builder too.
 */
export async function resolveOAuthBearer(
  c: Context,
  cfg: OAuthProviderConfig,
  mcpPath: string,
): Promise<AuthState | null> {
  const header = c.req.header('authorization') ?? c.req.header('Authorization');
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  if (!token) return null;
  const as = buildServer(c, cfg, `${resolveIssuer(c, cfg.issuer)}${mcpPath}`);
  const info = await as.verifyAccessToken(token);
  if (!info) return null;
  return {
    type: 'oauth_provider',
    subject: info.subject,
    clientId: info.clientId,
    scope: info.scope,
  };
}

/** `WWW-Authenticate` value pointing at the protected-resource metadata (RFC 9728 discovery). */
export function wwwAuthenticate(c: Context, cfg: OAuthProviderConfig): string {
  const issuer = resolveIssuer(c, cfg.issuer);
  const metadata = `${issuer}/.well-known/oauth-protected-resource`;
  return `Bearer error="invalid_token", resource_metadata="${metadata}"`;
}
