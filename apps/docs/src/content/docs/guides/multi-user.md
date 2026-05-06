---
title: Multi-user / multi-tenant servers
description: Run one mcify server that serves many users. Authentication, per-user data isolation, and the antipattern that breaks both.
---

A single mcify server can serve many users. Each request carries the user's identity, your handlers read it from `ctx.auth`, and queries / upstream calls go out scoped to that user. This guide walks the full pattern.

## The two-layer mental model

mcify has **two** authentication layers. Don't confuse them.

```
┌─────────────┐                                 ┌──────────────────┐
│   Agent     │ ── Bearer/JWT per user ──>      │   mcify server   │
│ (Claude /   │     (server-level auth)         │                  │
│  Cursor /   │ <─────────────────────────────  │ ctx.auth.claims  │
│  custom)    │                                 │                  │
└─────────────┘                                 └────────┬─────────┘
                                                         │
                                                         │ Upstream API key
                                                         │ (server holds it,
                                                         │  scopes the call by
                                                         │  ctx.auth.claims.userId)
                                                         ▼
                                                ┌──────────────────┐
                                                │  Stripe / Khipu  │
                                                │   / your DB      │
                                                └──────────────────┘
```

- **Server-level auth** (left arrow) — gates the agent against your MCP server. This is what `auth: bearer(...)` / `auth: oauth(...)` configures. Per-user means the token / JWT identifies which user is on the other side of the agent.
- **Upstream auth** (bottom arrow) — how your handler talks to the actual data source. Usually a server-held API key. Per-user data isolation happens _here_, by reading `ctx.auth.claims.userId` and including it in queries.

This guide is mostly about the left arrow. Once that's working, isolation in handlers is one line of code.

## Pattern A — OAuth (recommended for production)

Use this when you have an Identity Provider (WorkOS, Auth0, Clerk, Cognito, Keycloak, your own OIDC) that issues JWTs per user.

```ts title="mcify.config.ts"
import { defineConfig, oauth } from '@mcify/core';
import { listOrders } from './tools/list-orders.js';

export default defineConfig({
  name: 'orders',
  version: '1.0.0',
  auth: oauth({
    provider: 'workos', // or 'auth0', 'clerk', 'custom'
    audience: 'mcify-orders-server',
    // Provider-specific options:
    //   issuer, jwksUri, requiredScopes, etc.
  }),
  tools: [listOrders],
});
```

The runtime fetches the provider's JWKS, validates incoming JWTs, decodes the claims, and exposes them on `ctx.auth.claims`:

```ts title="src/tools/list-orders.ts"
import { defineTool } from '@mcify/core';
import { requireAuth } from '@mcify/core/middleware';
import { z } from 'zod';

export const listOrders = defineTool({
  name: 'orders_list',
  description: 'List orders for the authenticated user.',
  middlewares: [requireAuth()],
  input: z.object({
    limit: z.number().int().min(1).max(100).default(20),
  }),
  output: z.object({
    orders: z.array(z.object({ id: z.string(), total: z.number() })),
  }),
  handler: async ({ limit }, ctx) => {
    const userId = ctx.auth.claims['sub'] as string; // standard JWT claim
    const orders = await db.orders.findMany({
      where: { userId },
      take: limit,
    });
    return { orders };
  },
});
```

Each user's agent — Claude Desktop running on their laptop, your in-app agent, etc. — comes with its own JWT. The server-side `userId` is _never_ an input; it's pulled from the validated token.

## Pattern B — Bearer + custom verify (no IDP)

When you don't have an OIDC provider but you do have your own session store (Postgres `sessions` table, Redis, anything):

```ts title="mcify.config.ts"
import { bearer, defineConfig } from '@mcify/core';
import { sessionStore } from './lib/sessions.js';
import { listOrders } from './tools/list-orders.js';

export default defineConfig({
  name: 'orders',
  version: '1.0.0',
  auth: bearer({
    verify: async (token) => {
      const session = await sessionStore.lookup(token);
      if (!session || session.revokedAt) return null; // → 401
      return {
        token,
        claims: {
          userId: session.userId,
          tenantId: session.tenantId,
          scopes: session.scopes,
        },
      };
    },
  }),
  tools: [listOrders],
});
```

The handler reads the same way:

```ts
handler: async (input, ctx) => {
  const userId = ctx.auth.claims['userId'] as string;
  // ...
};
```

The runtime calls `verify` once per request. If you need to cache lookups across requests, do it inside `verify` (e.g. lru-cache with a short TTL).

## How clients pass per-user tokens

The MCP client config carries the token in a header. Each user gets their own:

### Claude Desktop / Cursor

The user pastes their personal token into the client config:

```json
{
  "mcpServers": {
    "orders": {
      "url": "https://orders-mcp.example.com/mcp",
      "headers": { "authorization": "Bearer <user_jwt_or_session_token>" }
    }
  }
}
```

How the user gets that token is your call:

- **OAuth flow**: ship a small webapp where the user signs in, then displays their JWT to copy.
- **Self-managed**: an admin dashboard that issues per-user session tokens.

### A custom agent

If you control the agent — Sofia in Lelemon Agentes, a Slackbot, whatever — your agent code looks up the right token per conversation:

```ts
const token = await sessionStore.tokenForUser(currentUser.id);
const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
  requestInit: { headers: { authorization: `Bearer ${token}` } },
});
```

## Per-tool authorization (scopes)

Server-level auth says "this token is valid." Per-tool auth says "this user is allowed to do this." Use `requireAuth({ check })`:

```ts
import { requireAuth } from '@mcify/core/middleware';

defineTool({
  name: 'orders_refund',
  middlewares: [
    requireAuth({
      check: (auth) => auth.claims.scopes?.includes('orders:refund'),
      message: 'Refunding orders requires the orders:refund scope.',
    }),
  ],
  ...
});
```

The runtime returns 403 (not 401) when the token authenticated but lacks the scope. The agent gets a useful error and can fall back.

## The critical antipattern

**Never read the user identity from the tool's input.**

```ts
// DANGEROUS — never do this
input: z.object({
  userId: z.string(), // The agent decides who the user is. So can an attacker.
  orderId: z.string(),
}),
handler: async ({ userId, orderId }) => {
  return await db.orders.find({ id: orderId, userId });
}
```

The agent — even a well-intentioned one — can pass any `userId` it wants. An attacker who controls the agent's prompt can read everyone else's data.

The fix is one line:

```ts
input: z.object({
  orderId: z.string(),
}),
handler: async ({ orderId }, ctx) => {
  const userId = ctx.auth.claims['sub'] as string; // server-validated, not agent-supplied
  return await db.orders.find({ id: orderId, userId });
}
```

This holds even when the agent itself is multi-user. The agent passes _its_ user's token; the server reads _that_ user's id from the validated token.

## Multi-tenant: when the agent represents an organization

A common shape:

- Your customer is a company ("acme-corp").
- Each company has many employees.
- Each employee has personal data (their own orders, messages, etc.).

Your JWT carries both `tenantId` (the company) and `sub` (the employee). The handler scopes by both:

```ts
handler: async (input, ctx) => {
  const tenantId = ctx.auth.claims['tenantId'] as string;
  const userId = ctx.auth.claims['sub'] as string;
  return await db.orders.findMany({
    where: { tenantId, userId },
  });
};
```

Some operations (e.g. "list all orders my team has") only filter by `tenantId`. The principle is the same: every query gets the most-specific scope from the validated claims.

## Per-user upstream calls

Sometimes the user themselves has credentials at the upstream API — a Fintoc `link_token`, a Stripe Connect account, a personal OAuth grant.

The pattern:

1. Store the per-user upstream credential in your DB, keyed by `userId`.
2. In the handler, look it up using `ctx.auth.claims.userId`.
3. Use it to make the upstream call.

```ts
handler: async (input, ctx) => {
  const userId = ctx.auth.claims['sub'] as string;
  const stripeConnectId = await db.stripeAccounts.findUnique({ where: { userId } });
  if (!stripeConnectId) {
    throw new Error('User has not connected a Stripe account yet.');
  }

  const res = await ctx.fetch('https://api.stripe.com/v1/charges', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.STRIPE_SECRET}`,
      'stripe-account': stripeConnectId.id, // Stripe Connect on-behalf-of header
    },
    body: new URLSearchParams({ ...input }).toString(),
  });
  return res.json();
};
```

The Fintoc connector at [`packages/examples/fintoc/`](https://github.com/Lelemon-studio/mcify/tree/main/packages/examples/fintoc) shows this with a `linkToken` passed as a tool input — useful when the agent already has the link token in its context. For higher security, store it server-side keyed by `userId` and look it up like Stripe Connect above.

## Checklist before you ship multi-user

- [ ] `auth.oauth(...)` or `auth.bearer({ verify })` — never `auth.none()` in production.
- [ ] No `userId` / `tenantId` / `accountId` fields in tool inputs. Read from `ctx.auth.claims`.
- [ ] Every query against your DB filters by the user's claim. Add a row-level security policy if your DB supports it (Postgres RLS, Supabase) for defense in depth.
- [ ] Per-user upstream credentials are stored server-side and looked up by `ctx.auth.claims`. Never accepted as tool input.
- [ ] Sensitive tools (refunds, deletions, exports) gated by `requireAuth({ check })` for scope checks.
- [ ] Logs scrub PII. Use `ctx.logger.info('order_listed', { userId: hash(userId), count: orders.length })` — hash the userId in logs unless you have a real reason not to.
- [ ] Token lifetime is short (15 min for JWTs is reasonable) and refresh is handled by the agent or your client wrapper.

## See also

- [Concepts → Auth](/concepts/auth/) — the auth API reference.
- [Concepts → Middleware](/concepts/middleware/) — `requireAuth`, scope checks.
- [Antipatterns to avoid](/guides/antipatterns/) — including the user-from-input pitfall.
