/**
 * OAuth 2.1 authorization server core, over the in-memory store. Mirrors the reference suite
 * (PlataformaContable's mcp-oauth.test.ts): the full flow (DCR → authorize → code → token →
 * refresh) and the security invariants — PKCE S256 mandatory, single-use codes, exact redirect_uri
 * (loopback ignores the port), expiry, refresh rotation, and theft detection (reusing a consumed
 * refresh → revoke the chain).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { deriveS256Challenge } from './pkce.js';
import { randomToken } from './crypto.js';
import { MemoryOAuthStore } from './memory-store.js';
import { OAuthError, OAuthServer } from './server.js';

const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const RESOURCE = 'https://lelemon.test/mcp';
const VERIFIER = 'test-verifier-0123456789-abcdefghijklmnopqrstuvwxyz-ABCD';
const SUBJECT = { userId: 'user-1', projectId: 'proj-1' };
let CHALLENGE = '';

let store: MemoryOAuthStore;
let as: OAuthServer;

beforeEach(async () => {
  store = new MemoryOAuthStore();
  as = new OAuthServer({ store, resource: RESOURCE });
  CHALLENGE = await deriveS256Challenge(VERIFIER);
});

/** Asserts a promise rejects with an OAuthError (optionally with a specific `error` code). */
async function expectOAuthError(p: Promise<unknown>, code?: string): Promise<void> {
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(OAuthError);
  if (code) expect((err as OAuthError).code).toBe(code);
}

/** Registers a fresh, distinct client (DCR is idempotent on identical metadata). */
async function newClient(): Promise<string> {
  const reg = await as.registerClient({
    clientName: `Claude (test ${randomToken(8)})`,
    redirectUris: [REDIRECT],
  });
  return reg.client_id;
}

async function freshCode(clientId: string): Promise<string> {
  return as.issueAuthorizationCode({
    clientId,
    subject: SUBJECT,
    redirectUri: REDIRECT,
    codeChallenge: CHALLENGE,
    codeChallengeMethod: 'S256',
    scope: null,
  });
}

describe('DCR', () => {
  it('registers a public client and requires at least one redirect_uri', async () => {
    const clientId = await newClient();
    expect(clientId.startsWith('mcp-')).toBe(true);
    await expectOAuthError(as.registerClient({ redirectUris: [] }), 'invalid_redirect_uri');
  });

  it('rejects non-loopback http redirect_uri', async () => {
    await expectOAuthError(as.registerClient({ redirectUris: ['http://evil.example.com/cb'] }));
  });

  it('rejects dangerous schemes (javascript:, data:)', async () => {
    await expectOAuthError(as.registerClient({ redirectUris: ['javascript:alert(1)'] }));
    await expectOAuthError(as.registerClient({ redirectUris: ['data:text/html,<script>'] }));
  });

  it('accepts a native-app (reverse-DNS) scheme', async () => {
    const reg = await as.registerClient({
      redirectUris: ['com.anthropic.claude://oauth/callback'],
    });
    expect(reg.redirect_uris[0]).toBe('com.anthropic.claude://oauth/callback');
  });

  it('rejects more than 5 redirect_uris', async () => {
    const many = Array.from({ length: 6 }, (_, i) => `https://claude.ai/cb${i}`);
    await expectOAuthError(as.registerClient({ redirectUris: many }));
  });

  it('filters grant_types down to the supported ones', async () => {
    const reg = await as.registerClient({
      redirectUris: [REDIRECT],
      grantTypes: ['authorization_code', 'implicit', 'password'],
    });
    expect(reg.grant_types).toEqual(['authorization_code']);
  });

  it('accepts loopback IPv6 [::1] with an ephemeral port', async () => {
    const reg = await as.registerClient({ redirectUris: ['http://[::1]:54321/cb'] });
    expect(reg.redirect_uris[0]).toBe('http://[::1]:54321/cb');
  });

  it('is idempotent: same metadata twice → same client_id, no duplicate', async () => {
    const meta = {
      clientName: 'Claude Idempotent',
      redirectUris: [REDIRECT, 'http://localhost:9000/cb'],
    };
    const first = await as.registerClient(meta);
    // Same redirect_uri set in a different order + same name → same client.
    const second = await as.registerClient({
      clientName: 'Claude Idempotent',
      redirectUris: ['http://localhost:9000/cb', REDIRECT],
    });
    expect(second.client_id).toBe(first.client_id);
    expect(await store.findClientsByName('Claude Idempotent')).toHaveLength(1);
  });

  it('does NOT dedup distinct metadata', async () => {
    const a = await as.registerClient({ clientName: 'Claude Distinct', redirectUris: [REDIRECT] });
    const b = await as.registerClient({
      clientName: 'Claude Distinct',
      redirectUris: ['http://localhost:9001/cb'],
    });
    expect(b.client_id).not.toBe(a.client_id);
  });
});

describe('redirect_uri loopback (RFC 8252: variable port)', () => {
  it('accepts loopback with a different port than registered', async () => {
    const reg = await as.registerClient({
      clientName: 'Claude Code',
      redirectUris: ['http://localhost:8080/callback'],
    });
    const client = await as.validateAuthorizeRequest({
      clientId: reg.client_id,
      redirectUri: 'http://localhost:54321/callback',
      codeChallenge: CHALLENGE,
      codeChallengeMethod: 'S256',
      responseType: 'code',
    });
    expect(client.clientId).toBe(reg.client_id);
  });

  it('does NOT match loopback with a different path', async () => {
    const reg = await as.registerClient({
      clientName: 'Claude Code',
      redirectUris: ['http://localhost:8080/callback'],
    });
    await expectOAuthError(
      as.validateAuthorizeRequest({
        clientId: reg.client_id,
        redirectUri: 'http://localhost:54321/other',
        codeChallenge: CHALLENGE,
        codeChallengeMethod: 'S256',
        responseType: 'code',
      }),
    );
  });

  it('does NOT match non-loopback with a different port (anti open-redirect)', async () => {
    const clientId = await newClient(); // registered with https://claude.ai/api/mcp/auth_callback
    await expectOAuthError(
      as.validateAuthorizeRequest({
        clientId,
        redirectUri: 'https://claude.ai:8443/api/mcp/auth_callback',
        codeChallenge: CHALLENGE,
        codeChallengeMethod: 'S256',
        responseType: 'code',
      }),
    );
  });
});

describe('resource (RFC 8707 audience binding)', () => {
  it('accepts the correct resource and the absence of resource', async () => {
    const clientId = await newClient();
    const withResource = await as.validateAuthorizeRequest({
      clientId,
      redirectUri: REDIRECT,
      codeChallenge: CHALLENGE,
      codeChallengeMethod: 'S256',
      responseType: 'code',
      resource: RESOURCE,
    });
    expect(withResource.clientId).toBe(clientId);
    const noResource = await as.validateAuthorizeRequest({
      clientId,
      redirectUri: REDIRECT,
      codeChallenge: CHALLENGE,
      codeChallengeMethod: 'S256',
      responseType: 'code',
    });
    expect(noResource.clientId).toBe(clientId);
  });

  it('rejects a resource that is not this MCP server', async () => {
    const clientId = await newClient();
    await expectOAuthError(
      as.validateAuthorizeRequest({
        clientId,
        redirectUri: REDIRECT,
        codeChallenge: CHALLENGE,
        codeChallengeMethod: 'S256',
        responseType: 'code',
        resource: 'https://other-server.cl/mcp',
      }),
      'invalid_target',
    );
  });
});

describe('validateAuthorizeRequest', () => {
  it('accepts a well-formed request', async () => {
    const clientId = await newClient();
    const client = await as.validateAuthorizeRequest({
      clientId,
      redirectUri: REDIRECT,
      codeChallenge: CHALLENGE,
      codeChallengeMethod: 'S256',
      responseType: 'code',
    });
    expect(client.clientId).toBe(clientId);
  });

  it('rejects method != S256', async () => {
    const clientId = await newClient();
    await expectOAuthError(
      as.validateAuthorizeRequest({
        clientId,
        redirectUri: REDIRECT,
        codeChallenge: CHALLENGE,
        codeChallengeMethod: 'plain',
        responseType: 'code',
      }),
      'invalid_request',
    );
  });

  it('rejects an unregistered redirect_uri', async () => {
    const clientId = await newClient();
    await expectOAuthError(
      as.validateAuthorizeRequest({
        clientId,
        redirectUri: 'https://claude.ai/other',
        codeChallenge: CHALLENGE,
        codeChallengeMethod: 'S256',
        responseType: 'code',
      }),
    );
  });

  it('rejects an unknown client_id', async () => {
    await expectOAuthError(
      as.validateAuthorizeRequest({
        clientId: 'mcp-nonexistent',
        redirectUri: REDIRECT,
        codeChallenge: CHALLENGE,
        codeChallengeMethod: 'S256',
        responseType: 'code',
      }),
      'invalid_client',
    );
  });
});

describe('authorization_code grant', () => {
  it('redeems the code and issues access+refresh; access resolves to the subject', async () => {
    const clientId = await newClient();
    const code = await freshCode(clientId);
    const tokens = await as.exchangeAuthorizationCode({
      code,
      clientId,
      redirectUri: REDIRECT,
      codeVerifier: VERIFIER,
    });
    expect(tokens.token_type).toBe('Bearer');
    expect(tokens.expires_in).toBeGreaterThan(0);

    const info = await as.verifyAccessToken(tokens.access_token);
    expect(info?.subject).toEqual(SUBJECT);
    expect(info?.clientId).toBe(clientId);
  });

  it('single-use code: the second redemption fails', async () => {
    const clientId = await newClient();
    const code = await freshCode(clientId);
    await as.exchangeAuthorizationCode({
      code,
      clientId,
      redirectUri: REDIRECT,
      codeVerifier: VERIFIER,
    });
    await expectOAuthError(
      as.exchangeAuthorizationCode({
        code,
        clientId,
        redirectUri: REDIRECT,
        codeVerifier: VERIFIER,
      }),
      'invalid_grant',
    );
  });

  it('rejects an incorrect PKCE verifier', async () => {
    const clientId = await newClient();
    const code = await freshCode(clientId);
    await expectOAuthError(
      as.exchangeAuthorizationCode({
        code,
        clientId,
        redirectUri: REDIRECT,
        codeVerifier: VERIFIER + 'x',
      }),
      'invalid_grant',
    );
  });

  it('rejects a redirect_uri different from /authorize', async () => {
    const clientId = await newClient();
    const code = await freshCode(clientId);
    await expectOAuthError(
      as.exchangeAuthorizationCode({
        code,
        clientId,
        redirectUri: 'https://claude.ai/other',
        codeVerifier: VERIFIER,
      }),
    );
  });

  it('rejects an expired code', async () => {
    const expiring = new OAuthServer({ store, resource: RESOURCE, codeTtlMs: 0 });
    const clientId = await newClient();
    const code = await expiring.issueAuthorizationCode({
      clientId,
      subject: SUBJECT,
      redirectUri: REDIRECT,
      codeChallenge: CHALLENGE,
      codeChallengeMethod: 'S256',
      scope: null,
    });
    await expectOAuthError(
      expiring.exchangeAuthorizationCode({
        code,
        clientId,
        redirectUri: REDIRECT,
        codeVerifier: VERIFIER,
      }),
      'invalid_grant',
    );
  });
});

describe('refresh_token grant', () => {
  it('rotates the refresh and issues new tokens', async () => {
    const clientId = await newClient();
    const code = await freshCode(clientId);
    const t1 = await as.exchangeAuthorizationCode({
      code,
      clientId,
      redirectUri: REDIRECT,
      codeVerifier: VERIFIER,
    });
    const t2 = await as.refreshAccessToken({ refreshToken: t1.refresh_token, clientId });
    expect(t2.access_token).not.toBe(t1.access_token);
    expect(t2.refresh_token).not.toBe(t1.refresh_token);
    expect((await as.verifyAccessToken(t2.access_token))?.subject).toEqual(SUBJECT);
  });

  it('reusing a consumed refresh revokes the chain (theft detection)', async () => {
    const clientId = await newClient();
    const code = await freshCode(clientId);
    const t1 = await as.exchangeAuthorizationCode({
      code,
      clientId,
      redirectUri: REDIRECT,
      codeVerifier: VERIFIER,
    });
    const t2 = await as.refreshAccessToken({ refreshToken: t1.refresh_token, clientId });
    // Reuse t1 (already consumed) → error + revoke the whole chain.
    await expectOAuthError(
      as.refreshAccessToken({ refreshToken: t1.refresh_token, clientId }),
      'invalid_grant',
    );
    // The "good" t2 refresh is invalidated too, and its access token revoked.
    await expectOAuthError(
      as.refreshAccessToken({ refreshToken: t2.refresh_token, clientId }),
      'invalid_grant',
    );
    expect(await as.verifyAccessToken(t2.access_token)).toBeNull();
  });

  it('rejects a refresh from another client', async () => {
    const clientA = await newClient();
    const clientB = await newClient();
    const code = await freshCode(clientA);
    const t = await as.exchangeAuthorizationCode({
      code,
      clientId: clientA,
      redirectUri: REDIRECT,
      codeVerifier: VERIFIER,
    });
    await expectOAuthError(
      as.refreshAccessToken({ refreshToken: t.refresh_token, clientId: clientB }),
      'invalid_grant',
    );
  });

  it('rejects an expired refresh', async () => {
    const expiring = new OAuthServer({ store, resource: RESOURCE, refreshTtlMs: 0 });
    const clientId = await newClient();
    const code = await freshCode(clientId);
    const t = await expiring.exchangeAuthorizationCode({
      code,
      clientId,
      redirectUri: REDIRECT,
      codeVerifier: VERIFIER,
    });
    await expectOAuthError(
      expiring.refreshAccessToken({ refreshToken: t.refresh_token, clientId }),
      'invalid_grant',
    );
  });
});

describe('assertGrantValid (shared by both grants)', () => {
  it('authorization_code: wrong clientId rejects', async () => {
    const clientA = await newClient();
    const clientB = await newClient();
    const code = await freshCode(clientA);
    await expectOAuthError(
      as.exchangeAuthorizationCode({
        code,
        clientId: clientB,
        redirectUri: REDIRECT,
        codeVerifier: VERIFIER,
      }),
      'invalid_grant',
    );
  });
});

describe('verifyAccessToken', () => {
  it('unknown or empty token → null', async () => {
    expect(await as.verifyAccessToken('does-not-exist')).toBeNull();
    expect(await as.verifyAccessToken('')).toBeNull();
  });
});
