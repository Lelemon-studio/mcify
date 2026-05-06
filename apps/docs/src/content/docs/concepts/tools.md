---
title: Tools
description: The smallest unit an MCP agent can invoke. Anatomy and lifecycle of a defineTool.
---

A tool is a function the agent can call. It has a name, a description, an input schema, an output schema, and a handler.

## Anatomy

```ts
import { defineTool } from '@mcify/core';
import { rateLimit, requireAuth, withTimeout } from '@mcify/core/middleware';
import { z } from 'zod';

export const createPayment = defineTool({
  // 1. Identity. Snake-case, prefixed by the service. Stable across versions.
  name: 'khipu_create_payment',

  // 2. What the agent reads to decide whether to call this tool. Be specific
  //    about *when* to use it (and when *not* to).
  description:
    'Create a Khipu payment link. Returns a URL the customer opens to pay via Chilean banks. ' +
    'Use for one-shot charges; no recurring support.',

  // 3. Composable middleware. Order matters — auth runs first, then rate limit,
  //    then timeout, then your handler.
  middlewares: [
    requireAuth({ message: 'khipu_create_payment requires authentication' }),
    rateLimit({ max: 60, windowMs: 60_000 }),
    withTimeout({ ms: 5_000 }),
  ],

  // 4. Input schema. Zod doubles as JSON Schema 7 (for tools/list) and TS types.
  input: z.object({
    subject: z.string().min(1).max(255).describe('What the payer sees on the bank screen'),
    currency: z.enum(['CLP', 'USD']),
    amount: z.number().positive(),
  }),

  // 5. Output schema. The runtime validates handler returns against this.
  output: z.object({
    paymentId: z.string(),
    paymentUrl: z.string().url(),
  }),

  // 6. The handler. Pure: input → output. Use ctx for dependency injection.
  handler: async (input, ctx) => {
    const res = await ctx.fetch('https://payment-api.khipu.com/v3/payments', {
      method: 'POST',
      headers: { 'x-api-key': process.env.KHIPU_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await res.json();
    return { paymentId: data.payment_id, paymentUrl: data.payment_url };
  },
});
```

## Lifecycle of a call

When an MCP client invokes `khipu_create_payment`:

1. **Transport** receives the JSON-RPC request (HTTP `POST /mcp` or stdio).
2. **Auth** runs first — `requireAuth` reads the token from headers and rejects 401 on miss.
3. **Input validation** — `input.parse()`. On failure: `McifyValidationError` with `phase: 'input'` and the offending field.
4. **Rate limit** — `rateLimit` checks the per-token bucket; returns 429 on overflow.
5. **Timeout** — `withTimeout` races your handler against a deadline.
6. **Your handler runs** — receives the parsed input + a `ctx` with `fetch`, `logger`, and the auth state.
7. **Output validation** — `output.parse()` on the return value. Drift here is _your_ bug, not the agent's; the runtime surfaces it loudly.
8. **Response** is wrapped in MCP's `CallToolResult` format and sent back.

## What goes in `ctx`

```ts
handler: async (input, ctx) => {
  ctx.fetch        // The runtime's fetch. Inject in tests, leave alone in prod.
  ctx.logger       // Pino-ish logger with .info, .warn, .error.
  ctx.auth         // { token, claims, scopes? } — set by your auth config.
  ctx.request      // RequestMeta — origin URL, headers, method.
  return ...
}
```

Use `ctx.fetch` in handlers, not `globalThis.fetch`. Tests inject a mock through `ctx`; using the global means the mock doesn't apply and your tests hit the network.

## Naming

Tool names must be unique within a server, snake_case, and prefixed by the service or domain:

| Good                    | Bad                       |
| ----------------------- | ------------------------- |
| `khipu_create_payment`  | `createPayment`           |
| `users_list`            | `list`                    |
| `inventory_check_stock` | `checkStockAndAlertIfLow` |

Why prefix? Because when the agent sees 200 tools across 12 servers (a real shape), `users_list` is grep-able and `list` is a 12-way collision. The [from-openapi generator](/guides/from-openapi/) does this automatically.

## Where to be explicit

The agent reads three things to decide whether and how to call your tool:

1. **`description`** — what the tool does + _when_ to use it. One sentence about the action, one about the trigger condition.
2. **Per-field `.describe()` on inputs** — what each parameter means and what format it expects.
3. **Errors you throw** — the message becomes context for the agent's next decision.

Don't skip any of the three.

## Next

- [Resources](/concepts/resources/) — read-only data the agent fetches, addressed by URI.
- [Prompts](/concepts/prompts/) — pre-built message templates the agent can request.
- [Auth](/concepts/auth/) — bearer, API key, OAuth.
- [Creating effective tools](/guides/creating-effective-tools/) — the longer best-practices guide.
