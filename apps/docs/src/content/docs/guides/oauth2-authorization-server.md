---
title: Securing an OAuth 2.1 authorization server for MCP
description: When your MCP server issues its own tokens ("Connect Claude" in two clicks), it becomes an OAuth 2.1 authorization server. The discovery chain, the non-negotiables (PKCE S256, single-use codes, refresh rotation, audience binding), and the gotchas that bite in production.
---

[Auth](/concepts/auth/) covers the common case: an agent presents a bearer/JWT your server **verifies**. This guide is about the other half — when **you issue those tokens yourself** so a user can click "Connect Claude", approve once, and operate your MCP server from their agent. That makes your service an **OAuth 2.1 authorization server**, and getting it wrong leaks access to real data.

This is the server-side counterpart of [Multi-user / multi-tenant](/guides/multi-user/): there, each request carries an identity and your handlers scope to it. Here we cover where that identity-bearing token _comes from_.

## Two roles, don't conflate them

When you connect to an upstream that speaks OAuth (Stripe, a SaaS), **you are the client**. When an agent connects to _your_ MCP server and you mint the token, **you are the authorization server (AS)** and the MCP endpoint is the **protected resource (RS)**. The same word "OAuth" hides opposite responsibilities. This guide is the AS+RS side.

```
┌──────────┐  1. POST /mcp (no token) → 401 + WWW-Authenticate   ┌─────────────────┐
│  Agent   │ ─────────────────────────────────────────────────> │  Your MCP server │
│ (Claude) │  2. discover metadata → register → authorize → token│  (AS + resource) │
│          │ <───────────────────────────────────────────────── │                 │
│          │  3. POST /mcp  Authorization: Bearer <token>        │  token → userId  │
└──────────┘ ───────────────────────────────────────────────────└─────────────────┘
```

## The discovery chain (what the agent actually does)

A modern MCP client (Claude included) bootstraps the whole flow from a single 401. Implement these endpoints and the agent wires itself:

1. **`POST /mcp` without a token → `401`** with a header pointing at your resource metadata:
   `WWW-Authenticate: Bearer error="invalid_token", resource_metadata="https://you/.well-known/oauth-protected-resource"`
2. **`GET /.well-known/oauth-protected-resource`** (RFC 9728): `{ resource, authorization_servers: [issuer], scopes_supported }`.
3. **`GET /.well-known/oauth-authorization-server`** (RFC 8414): the endpoint URLs + `code_challenge_methods_supported: ["S256"]` (and **only** S256), `token_endpoint_auth_methods_supported: ["none"]` (public client).
4. **`POST /register`** (RFC 7591, Dynamic Client Registration): the agent registers itself, you return a `client_id`. No secret — public client.
5. **`GET /authorize`**: your consent screen. The user must already have a session; if not, send them to login and back.
6. **`POST /token`**: exchange the code (with the PKCE verifier) for an access + refresh token.

## Non-negotiables

Each of these has a reason. Skipping one is a real vulnerability, not a style choice.

### PKCE S256, mandatory

Public clients have no secret, so the **proof key** is the only thing stopping a stolen authorization code from being redeemed by an attacker.

- Advertise **only** `S256`. Reject `plain` and a missing/short `code_challenge` at `/authorize`.
- At `/token`, recompute `base64url(sha256(code_verifier))` and compare to the stored challenge in **constant time**.

```ts
import { timingSafeEqual, createHash } from 'node:crypto';

function verifyPkceS256(verifier: string, storedChallenge: string): boolean {
  // 43–128 unreserved chars; anything else is malformed.
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  const derived = createHash('sha256').update(verifier).digest('base64url');
  const a = Buffer.from(derived),
    b = Buffer.from(storedChallenge);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

### Authorization codes: single-use, atomic, short-lived

A code must be redeemable exactly once. Checking "is it consumed?" and then marking it consumed in two steps is a race: two concurrent redemptions both pass the check. **Consume atomically** and act on whether the write happened:

```ts
// Returns the row only if THIS call flipped consumed_at from NULL.
const [row] = await db
  .update(authCodes)
  .set({ consumedAt: new Date() })
  .where(and(eq(authCodes.codeHash, hash), isNull(authCodes.consumedAt)))
  .returning();
if (!row) throw new OAuthError('invalid_grant', 'code already used');
```

Give codes a **60-second TTL**, and bind each to `client_id` + `redirect_uri` + the **user id taken from the server-side session** (never from a form field). At `/token`, re-check client, redirect_uri, expiry, and PKCE.

### redirect_uri: exact match + scheme allow-list

Match the `redirect_uri` **exactly** (string equality) against the ones registered via DCR — at `/authorize` and at `/token`. An open redirect here exfiltrates the code. And **block dangerous schemes** at registration: `javascript:`, `data:`, `vbscript:`, `file:`, `blob:` all parse as valid URLs and become XSS/exfiltration vectors if a client ever navigates them.

**One exception — loopback ports.** Native clients (Claude Code, IDE plugins) listen on an _ephemeral_ loopback port and register `http://localhost:<port>/callback` (RFC 8252 §7.3). The port can differ between registration and a later re-auth, so for loopback hosts match scheme + host + path and **ignore the port**. Keep exact match for everything else.

```ts
function isLoopback(u: URL) {
  return u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
}
function redirectUriMatches(registered: string[], presented: string): boolean {
  if (registered.includes(presented)) return true; // exact (https, custom schemes)
  let p: URL;
  try {
    p = new URL(presented);
  } catch {
    return false;
  }
  if (!isLoopback(p)) return false; // only loopback may vary the port
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
```

```ts
const DANGEROUS = new Set(['javascript', 'data', 'vbscript', 'file', 'blob']);
function isAllowedRedirectUri(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  const scheme = u.protocol.replace(/:$/, '');
  if (DANGEROUS.has(scheme)) return false;
  if (u.protocol === 'https:') return true;
  if (u.protocol === 'http:') return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  // native-app custom scheme (e.g. com.anthropic.claude://): reverse-DNS, well-formed
  return /^[a-z][a-z0-9+.-]*$/.test(scheme) && (u.hostname.length > 0 || u.pathname.length > 0);
}
```

### Tokens: hash at rest, rotate refresh, detect theft

- **High entropy**: 32 random bytes (256 bits), base64url.
- **Store the SHA-256 hash, never the plaintext.** Look tokens up by hash (unique index). The plaintext is returned to the client exactly once, at issuance. A DB dump then leaks nothing usable.
- Short access TTL (~1h). Refresh tokens with **rotation**: every refresh mints a new pair and consumes the old one.
- **Theft detection**: if a _consumed_ refresh token is presented again, treat it as a compromise and **revoke the whole chain** (all access + refresh for that user+client).

The rotation has the same atomicity trap as the code — and it's easy to miss because the happy path works. Consume the refresh **atomically** and only then issue:

```ts
// WRONG: check-then-act. Two concurrent refreshes both mint valid tokens,
// and neither trips theft detection.
if (row.consumedAt) { await revokeChain(...); throw ... }
const tokens = await issueTokenPair(...)
await markConsumed(row.id)               // <-- the gap

// RIGHT: atomic consume is the gate. Issue only if we won the race.
const consumed = await db.update(refreshTokens)
  .set({ consumedAt: new Date() })
  .where(and(eq(refreshTokens.id, row.id), isNull(refreshTokens.consumedAt)))
  .returning()
if (consumed.length === 0) { await revokeChain(row.userId, row.clientId); throw new OAuthError('invalid_grant', 'reused') }
const tokens = await issueTokenPair(row.userId, row.clientId, row.scope)
```

### Audience binding (RFC 8707 resource indicators)

A token minted for your MCP server should not be replayable against another resource on the same issuer (audience confusion). If the client sends `resource`, **validate it equals your MCP endpoint** at `/authorize` and `/token`; bind the issued token to it. If you serve exactly one resource, validating-and-rejecting-mismatches is enough; don't _require_ `resource`, since not every client sends it yet.

```ts
function validateResource(resource?: string | null) {
  if (resource && resource !== `${issuer}/mcp`)
    throw new OAuthError('invalid_target', 'resource is not this MCP server');
}
```

### Harden DCR, and never log secrets

Dynamic Client Registration is unauthenticated by design — so cap the inputs (`redirect_uris.length`, URI length, `client_name` length), filter `grant_types` to what you actually implement, and put a **rate limit at the edge** (CDN/WAF) in front of `/register`. And never log access tokens, refresh tokens, authorization codes, `code_verifier`, or the `Authorization` header.

### Bind every token to a user, then authorize per tool

The token's whole job is to carry _who_ is acting. Resolve it to a `userId` from the verified token — **never** from a header or body the client controls — and enforce access on every tool call (see [Multi-user](/guides/multi-user/)). A read tool checks the user can see the company; a write tool checks the user's role allows the action. The token grants _identity_, not _permission_.

## Transport: stateless Streamable HTTP

For request/response tools, run the Streamable HTTP transport **stateless**: build a fresh server + transport per request, bound to the token's `userId`, and return JSON. No shared state between requests means no tenant bleed. Reserve SSE for tools that actually stream progress or server-initiated notifications.

```ts
async function handle(req: Request): Promise<Response> {
  const info = await verifyAccessToken(bearer(req));
  if (!info) return unauthorized(); // 401 + WWW-Authenticate
  const server = buildServerFor(info.userId); // identity captured in closure
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req, {
      authInfo: { clientId: info.clientId, scopes: [], extra: { userId: info.userId } },
    });
  } finally {
    await transport.close();
    await server.close();
  } // no per-request leak
}
```

## Checklist

- [ ] 401 → `oauth-protected-resource` → `oauth-authorization-server` → DCR → authorize → token all reachable.
- [ ] Metadata advertises `S256` only and a public client (`token_endpoint_auth_method: none`).
- [ ] PKCE S256 enforced, constant-time verify, `plain`/missing rejected.
- [ ] Authorization code: atomic single-use, ≤60s TTL, bound to client + redirect_uri + server-side user.
- [ ] `redirect_uri` exact-matched (port-flexible only for loopback, RFC 8252); dangerous schemes blocked at registration.
- [ ] Tokens hashed at rest; access short-lived; refresh rotated with chain-revoke on reuse — **consume atomically**.
- [ ] `resource` validated when present (audience binding).
- [ ] DCR inputs capped; `/register` rate-limited at the edge; no tokens/codes/verifiers in logs.
- [ ] Every token resolves to a user; per-tool authorization enforced.
- [ ] Stateless transport; resources closed per request.

See also: [Auth](/concepts/auth/), [Multi-user / multi-tenant](/guides/multi-user/), and the project's `SECURITY.md`.
