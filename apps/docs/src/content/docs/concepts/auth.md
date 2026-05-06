---
title: Auth
description: Bearer, API key, OAuth, or none. Configured at the server, enforced per request.
---

Auth in mcify is **between the agent and your MCP server**. Don't confuse it with the auth between your server and the upstream API it wraps — those are two different layers.

```
[ Agent ]  ←  bearer token  →  [ mcify server ]  ←  upstream API key  →  [ Khipu / Bsale / ... ]
```

Your `auth` config governs the left arrow only.

## Bearer (recommended default)

```ts
import { bearer, defineConfig } from '@mcify/core';

defineConfig({
  auth: bearer({ env: 'MCIFY_AUTH_TOKEN' }),
  ...
});
```

The agent sends `Authorization: Bearer <token>`. The runtime compares with `process.env.MCIFY_AUTH_TOKEN` using a constant-time check.

Generate the token: `openssl rand -hex 32`. Store it where you store other secrets (Workers `wrangler secret`, Fly `flyctl secrets`, Railway env vars, Kubernetes Secret).

## API key

```ts
import { apiKey } from '@mcify/core';

auth: apiKey({ headerName: 'x-api-key', env: 'MCIFY_API_KEY' }),
```

Same shape as bearer, different header. Useful when the consuming agent already speaks `x-api-key` to its other backends.

## OAuth

For multi-tenant setups where each user has their own credentials:

```ts
import { oauth } from '@mcify/core';

auth: oauth({
  provider: 'workos',
  audience: 'mcify-server',
  // Provider-specific options.
}),
```

The runtime validates JWTs against the provider's JWKS. The decoded claims land in `ctx.auth.claims` so your handlers can do per-user authorization.

## Custom verify

If your token shape doesn't fit `bearer` / `apiKey`, pass a `verify` function:

```ts
auth: bearer({
  verify: async (token, ctx) => {
    const session = await mySessionStore.lookup(token);
    if (!session) return null; // → 401
    return { token, claims: { userId: session.userId, scopes: session.scopes } };
  },
}),
```

The runtime calls `verify` once per request, caches the result for the duration of that request, and exposes the return value as `ctx.auth`.

## None

For local dev or fully-public servers:

```ts
import { auth } from '@mcify/core';

auth: auth.none(),
```

Don't ship this to production unless your server only exposes idempotent reads of public data. Even then, `rateLimit` middleware on every tool is mandatory.

## Per-tool auth

The server-level `auth` is the gate. To require an _additional_ check per tool, use `requireAuth` middleware with a predicate:

```ts
defineTool({
  middlewares: [
    requireAuth({
      check: (auth) => auth.claims.scopes?.includes('payments:write'),
      message: 'requires the payments:write scope',
    }),
  ],
  ...
});
```

`requireAuth` returns 403 (not 401) when the request authenticated but lacks the right scope. The agent gets a useful error.
