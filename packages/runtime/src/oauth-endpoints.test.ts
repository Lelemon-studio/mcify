/**
 * HTTP integration for the first-party OAuth 2.1 authorization server. Drives the full discovery →
 * DCR → authorize → token → call flow against `createHttpHandler`, plus the 401 + WWW-Authenticate
 * bootstrap and the consent redirect branch.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  defineConfig,
  defineTool,
  oauthProvider,
  MemoryOAuthStore,
  deriveS256Challenge,
  type AuthorizeDecision,
  type Config,
} from '@mcify/core';
import { createHttpHandler } from './http.js';

const ISSUER = 'https://mcp.test';
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const VERIFIER = 'integration-verifier-0123456789-abcdefghijklmnopqrst-XYZ';

let store: MemoryOAuthStore;
let decision: AuthorizeDecision;

function buildConfig(): Config {
  const whoami = defineTool({
    name: 'whoami',
    description: 'Returns the authenticated subject.',
    input: z.object({}),
    output: z.object({ userId: z.string() }),
    handler: (_input, ctx) => {
      if (ctx.auth.type !== 'oauth_provider') throw new Error('expected oauth_provider auth');
      return { userId: ctx.auth.subject['userId'] ?? '' };
    },
  });
  return defineConfig({
    name: 'oauth-server',
    version: '1.0.0',
    auth: oauthProvider({
      issuer: ISSUER,
      store,
      authorize: () => decision,
      resourceName: 'Test MCP',
    }),
    tools: [whoami],
  });
}

const handler = () => createHttpHandler(buildConfig());

beforeEach(() => {
  store = new MemoryOAuthStore();
  decision = { status: 'authenticated', subject: { userId: 'user-42' } };
});

/** Run the DCR → authorize → token dance and return the issued access token. */
async function connect(h = handler()): Promise<{ accessToken: string; refreshToken: string }> {
  const challenge = await deriveS256Challenge(VERIFIER);
  const reg = (await (
    await h(
      new Request(`${ISSUER}/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_name: 'Claude', redirect_uris: [REDIRECT] }),
      }),
    )
  ).json()) as { client_id: string };

  const authzUrl = new URL(`${ISSUER}/authorize`);
  authzUrl.search = new URLSearchParams({
    response_type: 'code',
    client_id: reg.client_id,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'xyz',
  }).toString();
  const authzRes = await h(new Request(authzUrl, { method: 'GET' }));
  expect(authzRes.status).toBe(302);
  const location = new URL(authzRes.headers.get('location') ?? '');
  expect(location.searchParams.get('state')).toBe('xyz');
  const code = location.searchParams.get('code') ?? '';
  expect(code).not.toBe('');

  const tokenRes = await h(
    new Request(`${ISSUER}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: reg.client_id,
        redirect_uri: REDIRECT,
        code_verifier: VERIFIER,
      }).toString(),
    }),
  );
  expect(tokenRes.status).toBe(200);
  const tokens = (await tokenRes.json()) as { access_token: string; refresh_token: string };
  return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token };
}

describe('discovery + 401 bootstrap', () => {
  it('POST /mcp without a token → 401 + WWW-Authenticate(resource_metadata)', async () => {
    const res = await handler()(
      new Request(`${ISSUER}/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      }),
    );
    expect(res.status).toBe(401);
    const wwwAuth = res.headers.get('www-authenticate') ?? '';
    expect(wwwAuth).toContain('Bearer');
    expect(wwwAuth).toContain(`${ISSUER}/.well-known/oauth-protected-resource`);
  });

  it('serves protected-resource metadata (RFC 9728)', async () => {
    const res = await handler()(new Request(`${ISSUER}/.well-known/oauth-protected-resource`));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { resource: string; authorization_servers: string[] };
    expect(json.resource).toBe(`${ISSUER}/mcp`);
    expect(json.authorization_servers).toEqual([ISSUER]);
  });

  it('serves authorization-server metadata (RFC 8414), S256-only + public client', async () => {
    const res = await handler()(new Request(`${ISSUER}/.well-known/oauth-authorization-server`));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      authorization_endpoint: string;
      token_endpoint: string;
      registration_endpoint: string;
      code_challenge_methods_supported: string[];
      token_endpoint_auth_methods_supported: string[];
    };
    expect(json.authorization_endpoint).toBe(`${ISSUER}/authorize`);
    expect(json.token_endpoint).toBe(`${ISSUER}/token`);
    expect(json.registration_endpoint).toBe(`${ISSUER}/register`);
    expect(json.code_challenge_methods_supported).toEqual(['S256']);
    expect(json.token_endpoint_auth_methods_supported).toEqual(['none']);
  });
});

describe('full OAuth flow', () => {
  it('DCR → authorize → token → authenticated call returns the subject', async () => {
    const h = handler();
    const { accessToken } = await connect(h);

    const res = await h(
      new Request(`${ISSUER}/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'whoami', arguments: {} },
        }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { result: { content: { text: string }[] } };
    const payload = JSON.parse(json.result.content[0]?.text ?? '{}') as { userId: string };
    expect(payload.userId).toBe('user-42');
  });

  it('an invalid Bearer is rejected with 401', async () => {
    const res = await handler()(
      new Request(`${ISSUER}/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer not-a-real-token' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('refresh_token rotates and the new access token works', async () => {
    const h = handler();
    const { refreshToken } = await connect(h);
    const reg = await h(
      new Request(`${ISSUER}/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          // client_id is required; reuse the only registered client.
          client_id: (await store.findClientsByName('Claude'))[0]?.clientId ?? '',
        }).toString(),
      }),
    );
    expect(reg.status).toBe(200);
    const t = (await reg.json()) as { access_token: string };
    expect(t.access_token).toBeTruthy();
  });
});

describe('consent redirect branch', () => {
  it('when the host has no session, /authorize 302s to the consent URL', async () => {
    decision = { status: 'redirect', url: 'https://dashboard.test/consent?return=abc' };
    const challenge = await deriveS256Challenge(VERIFIER);
    const h = handler();
    const reg = (await (
      await h(
        new Request(`${ISSUER}/register`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ client_name: 'Claude', redirect_uris: [REDIRECT] }),
        }),
      )
    ).json()) as { client_id: string };
    const url = new URL(`${ISSUER}/authorize`);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: reg.client_id,
      redirect_uri: REDIRECT,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }).toString();
    const res = await h(new Request(url, { method: 'GET' }));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://dashboard.test/consent?return=abc');
  });
});

describe('authorize validation (pre-consent)', () => {
  it('rejects a missing/non-S256 PKCE challenge without redirecting', async () => {
    const h = handler();
    const reg = (await (
      await h(
        new Request(`${ISSUER}/register`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ client_name: 'Claude', redirect_uris: [REDIRECT] }),
        }),
      )
    ).json()) as { client_id: string };
    const url = new URL(`${ISSUER}/authorize`);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: reg.client_id,
      redirect_uri: REDIRECT,
      code_challenge_method: 'plain',
      code_challenge: 'x',
    }).toString();
    const res = await h(new Request(url, { method: 'GET' }));
    expect(res.status).toBe(400);
    expect(res.headers.get('location')).toBeNull();
  });
});
