---
title: Middleware
description: Composable wrappers for cross-cutting tool concerns.
---

Middleware in mcify wraps a tool's handler. Each one runs in order, can short-circuit (block the call), and can mutate the response.

## Built-ins

```ts
import { requireAuth, rateLimit, withTimeout } from '@mcify/core/middleware';

middlewares: [
  requireAuth(),                         // Reject if ctx.auth is null.
  rateLimit({ max: 60, windowMs: 60_000 }), // Per-token bucket.
  withTimeout({ ms: 5_000 }),            // AbortController-backed deadline.
],
```

| Middleware    | What it does                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------- |
| `requireAuth` | Asserts the request authenticated. Optional `check` predicate for scope checks. Returns 401 / 403. |
| `rateLimit`   | Sliding window per token. In-memory by default; pluggable store for distributed setups.            |
| `withTimeout` | Wraps the handler in `Promise.race` against a timer. Aborts via `ctx.signal`.                      |

## Order matters

Middleware runs **outer-to-inner** in the order you list them, then the handler runs, then they unwind in reverse. Same as Express / Hono / Koa.

The recommended order:

1. `requireAuth` — fail fast on unauthenticated calls; everything below is wasted compute on a request you're going to reject anyway.
2. `rateLimit` — gate per token, _after_ you know the token is valid.
3. `withTimeout` — last, so the timer doesn't tick during auth work.

## Custom middleware

```ts
import type { Middleware } from '@mcify/core';

export const auditLog: Middleware = async (ctx, next) => {
  const start = Date.now();
  try {
    const result = await next();
    ctx.logger.info('tool_invoked', { tool: ctx.toolName, ms: Date.now() - start });
    return result;
  } catch (e) {
    ctx.logger.warn('tool_failed', {
      tool: ctx.toolName,
      ms: Date.now() - start,
      error: String(e),
    });
    throw e;
  }
};
```

Use it like any other:

```ts
defineTool({
  middlewares: [requireAuth(), auditLog, withTimeout({ ms: 5_000 })],
  ...
});
```

## composeMiddlewares (utility)

When you have a stack you want to share across many tools:

```ts
import { composeMiddlewares } from '@mcify/core';

const standardStack = composeMiddlewares([
  requireAuth(),
  rateLimit({ max: 60, windowMs: 60_000 }),
  withTimeout({ ms: 5_000 }),
  auditLog,
]);

defineTool({ middlewares: [standardStack], ... });
```

`composeMiddlewares` flattens the stack into a single middleware so you don't have to spread an array into every tool definition.
