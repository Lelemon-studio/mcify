# AGENTS.md — AI agent instructions for {{name}}

> Read by Claude Code, Cursor, Cody, Windsurf, Copilot Workspace and other coding assistants.

## What this project is

A Khipu (Chile) MCP server, scaffolded from the `example-khipu` mcify template. Exposes Khipu payment-link operations as MCP tools that AI agents can invoke.

Stack: TypeScript (strict), Zod, [`@mcify/core`](https://github.com/Lelemon-studio/mcify) builders, [`@mcify/runtime`](https://github.com/Lelemon-studio/mcify) Hono-based runtime.

## Layout

```
{{name}}/
├── mcify.config.ts          # wires the KhipuClient + tools, declares MCP-side auth
├── src/
│   ├── client.ts            # KhipuClient — fetch wrapper for payment-api.khipu.com/v3
│   ├── client.test.ts       # unit tests with mock fetch
│   ├── index.ts             # re-exports
│   └── tools/
│       ├── create-payment.ts        # khipu_create_payment tool
│       └── get-payment-status.ts    # khipu_get_payment_status tool
└── package.json
```

## Two-key auth model

- **`KHIPU_API_KEY`** — your merchant API key from `https://khipu.com/merchant/profile/api`. Used by `KhipuClient` to authenticate **this server against Khipu**. Never leaves the process.
- **`MCIFY_AUTH_TOKEN`** — bearer token your AI agents present **to this server**. Generate with `openssl rand -hex 32`. Treat it as a secret.

## Adding a new tool

The canonical pattern in this codebase:

```ts
// src/tools/list-payments.ts
import { defineTool, schema } from '@mcify/core';
import { rateLimit, requireAuth, withTimeout } from '@mcify/core/middleware';
import { z } from 'zod';
import type { KhipuClient } from '../client.js';

export const createKhipuListPaymentsTool = (client: KhipuClient) =>
  defineTool({
    name: 'khipu_list_payments',
    description: 'List recent Khipu payments. Returns the most recent N entries.',
    middlewares: [
      requireAuth(),
      rateLimit({ max: 60, windowMs: 60_000 }),
      withTimeout({ ms: 5_000 }),
    ],
    input: z.object({
      limit: z.number().int().positive().max(100).default(20),
    }),
    output: schema.paginated(
      z.object({
        paymentId: z.string(),
        status: z.string(),
        subject: z.string(),
        amount: z.number(),
      }),
    ),
    handler: async ({ limit }) => {
      // Add a method to KhipuClient if it doesn't exist yet, then call it here.
      throw new Error('not implemented');
    },
  });
```

Then register in `mcify.config.ts`:

```ts
import { createKhipuListPaymentsTool } from './src/tools/list-payments.js';
// ...
export default defineConfig({
  // ...
  tools: [
    createKhipuCreatePaymentTool(client),
    createKhipuGetPaymentStatusTool(client),
    createKhipuListPaymentsTool(client), // ← new
  ],
});
```

## Conventions for this project

- **Tools take the client as a constructor argument** (`createKhipu*Tool(client)`). Don't hard-code the API key inside tool factories — keep auth concerns at the boundary (mcify.config.ts).
- **`KhipuClient` is the only place that touches `fetch` directly.** Tool handlers call `client.something()`. Tests pass a `fetch` mock to the client.
- **snake_case → camelCase mapping lives in `client.ts`.** Tools and tests work with camelCase exclusively.
- **Errors from Khipu propagate as `KhipuApiError`.** The runtime catches them and returns an MCP `isError` content block — don't wrap them in your own try/catch unless you have a reason.
- **All tools use the same three middlewares**: `requireAuth`, `rateLimit`, `withTimeout`. Adjust limits per tool based on Khipu's rate limits and the tool's risk profile.

## Anti-patterns specific to this project

| Don't                                                  | Do                                                                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Read `process.env.KHIPU_API_KEY` inside a tool handler | Configured once in `mcify.config.ts`, passed to the client at boot.                                          |
| Write to global `fetch` to mock in tests               | Pass a `fetch` mock to `KhipuClient` constructor or to `createTestClient`.                                   |
| Add a tool without rate limiting                       | Khipu has rate limits on its API — exceeding them gets you 429s and complaints from your merchant.           |
| Log payment amounts at info level                      | Treat anything tied to a transaction as PII-adjacent. Use `debug` and add logging only when troubleshooting. |
| Return raw Khipu responses to the agent                | Always go through Zod output schemas — they're the contract with the LLM.                                    |

## Testing

```bash
pnpm test          # vitest run — uses mock fetch, no live Khipu calls
```

Tests live as `*.test.ts` next to source. The pattern:

```ts
import { vi } from 'vitest';
import { createTestClient } from '@mcify/runtime/test';
import config from '../mcify.config.js';

const fetchMock = vi
  .fn()
  .mockResolvedValue(
    new Response(JSON.stringify({ payment_id: 'p_1', payment_url: 'https://...' })),
  );
const client = createTestClient(config, {
  auth: { type: 'bearer', token: 'test' },
  fetch: fetchMock,
});
const result = await client.invokeTool('khipu_create_payment', {
  /* ... */
});
```

## Develop

```bash
pnpm install
export KHIPU_API_KEY='your-merchant-key'
export MCIFY_AUTH_TOKEN="$(openssl rand -hex 32)"
pnpm dev
```

The MCP server listens on `:8888/mcp`. The inspector at `:3001` shows your tools and lets you invoke them by hand from the Playground tab.

## When in doubt

- Khipu API docs: https://docs.khipu.com/portal/en/kb/khipu-api
- mcify docs: https://mcify.dev
- The reference connector this template is based on: https://github.com/Lelemon-studio/mcify/tree/main/packages/examples/khipu

If you (the AI agent) discover a stale rule in this file while working, fix it in the same PR.
