# AGENTS.md — AI agent instructions for {{name}}

> Read by Claude Code, Cursor, Cody, Windsurf, Copilot Workspace and other coding assistants. Keep it tight; update it when conventions change.

## What this project is

An MCP (Model Context Protocol) server built with [mcify](https://mcify.dev). It exposes typed tools that AI agents can invoke — Claude Desktop, Cursor, Lelemon Agentes, custom agents.

Stack: TypeScript (strict), Zod, [`@mcify/core`](https://github.com/Lelemon-studio/mcify) builders, [`@mcify/runtime`](https://github.com/Lelemon-studio/mcify) Hono-based runtime.

## Layout

```
{{name}}/
├── mcify.config.ts        # defineConfig — wires tools, resources, prompts, auth.
├── tools/                 # one file per tool (create when needed).
├── resources/             # one file per resource template.
├── prompts/               # one file per prompt.
└── package.json
```

## Adding a tool

The canonical pattern. Don't deviate without a reason.

```ts
// tools/<verb>-<noun>.ts
import { defineTool, schema } from '@mcify/core';
import { requireAuth, rateLimit, withTimeout } from '@mcify/core/middleware';
import { z } from 'zod';

export const createPayment = defineTool({
  name: 'create_payment', // /^[a-zA-Z0-9_-]{1,64}$/
  description: 'One sentence, present tense, says what the tool does',
  middlewares: [
    requireAuth(), // reject unauthenticated calls
    rateLimit({ max: 60, windowMs: 60_000 }),
    withTimeout({ ms: 5_000 }),
  ],
  input: z.object({
    amount: z.number().positive(),
    currency: z.enum(['CLP', 'USD']),
    description: z.string().min(1).max(255).describe('Shown to the customer'),
  }),
  output: z.object({
    id: z.string(),
    paymentUrl: schema.httpUrl(),
  }),
  handler: async (input, ctx) => {
    // Your business logic. Use ctx.fetch (NOT global fetch) so the runtime
    // can swap it during tests.
    const response = await ctx.fetch('https://api.example.com/payments', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.UPSTREAM_API_KEY}` },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
    return response.json();
  },
});
```

Then register it in `mcify.config.ts`:

```ts
import { createPayment } from './tools/create-payment.js';

export default defineConfig({
  // ...
  tools: [createPayment],
});
```

## Schema helpers (use these instead of rolling your own)

`@mcify/core` exports a `schema` namespace with battle-tested Zod fragments:

| Helper                   | What it validates                                             |
| ------------------------ | ------------------------------------------------------------- |
| `schema.id(max?)`        | Non-empty string up to `max` chars (default 256).             |
| `schema.url()`           | Any URL (http, https, ftp, ...).                              |
| `schema.httpUrl()`       | Only `http://` or `https://`.                                 |
| `schema.timestamp()`     | ISO 8601 with offset.                                         |
| `schema.money()`         | `{ amount: number; currency: string }` (currency uppercased). |
| `schema.paginated(item)` | `{ items: T[]; cursor?, total? }`.                            |

## Auth

Pick one in `mcify.config.ts`:

```ts
import { bearer, apiKey, auth as authNs } from '@mcify/core';

auth: bearer({ env: 'MY_AUTH_TOKEN' }),                      // recommended for agents
auth: apiKey({ headerName: 'x-api-key', env: 'MY_API_KEY' }),
auth: authNs.none(),                                          // public; rare
```

The runtime resolves the env var at request time and uses `constantTimeEqual` for comparison. Pass a `verify` callback if you need DB-backed auth.

## Testing

Use `createTestClient` from `@mcify/runtime/test`. Same dispatch path as production HTTP — no protocol mocks, no flakiness.

```ts
// tools/create-payment.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createTestClient } from '@mcify/runtime/test';
import config from '../mcify.config.js';

describe('create_payment', () => {
  it('happy path', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 'p_1', paymentUrl: 'https://...' }), { status: 200 }),
      );
    const client = createTestClient(config, {
      auth: { type: 'bearer', token: 'test' },
      fetch: fetchMock,
    });
    const result = await client.invokeTool<{ id: string }>('create_payment', {
      amount: 100,
      currency: 'CLP',
      description: 'test',
    });
    expect(result.id).toBe('p_1');
  });
});
```

Key options on `createTestClient`:

- `auth` — inject a fake auth state so `requireAuth` middleware passes.
- `fetch` — inject a mock to avoid hitting real APIs.

## Development workflow

```bash
pnpm dev           # mcify dev — server on :8888, inspector on :3001
pnpm test          # vitest run
pnpm build         # mcify build — produces dist/server.mjs
pnpm generate      # emits a typed client stub from your config
```

The inspector at `http://localhost:3001` shows your tools, a live calls log, and a playground to invoke tools by hand. Open it the moment you start `mcify dev`.

## Conventions for this project

- **TypeScript strict, ESM only.** Imports use `.js` extensions even for `.ts` files (NodeNext-compatible emit).
- **One tool per file** under `tools/`. Filename matches the tool name kebab-cased.
- **Schemas are the source of truth.** Don't write TS interfaces alongside Zod — derive types via `z.infer<typeof input>` if you need them.
- **No `console.log` in committed code.** Use `ctx.logger.info('...', { meta })` so logs stay structured.
- **No raw `fetch(...)`.** Use `ctx.fetch` so tests can swap it.
- **No `throw 'string'`.** Throw `Error` instances or subclasses.
- **No `any` without a comment** explaining why.
- **Conventional Commits** (`feat:`, `fix:`, `chore:`, ...).

## Anti-patterns specific to mcify projects

| Don't                                                   | Do                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Validate input with manual `if (typeof x !== ...)`      | Define a Zod schema in `input:` — runtime validates at the boundary.            |
| Wrap your handler in your own `try/catch` to log errors | Just `throw`. The runtime emits `tool:called` events with the error attached.   |
| Import secrets at module load time                      | Read from `process.env` (or `ctx` for Workers env bindings) inside the handler. |
| Mutate the `ctx` object in middleware                   | Pass a transformed input via `next(modified)` instead.                          |
| Add a tool without a description                        | The description is what tells the LLM when to use it — make it count.           |

## When in doubt

Read the docs at https://mcify.dev. Public examples live at https://github.com/Lelemon-studio/mcify/tree/main/packages/examples.

If you (the AI agent) discover a stale rule in this file while working, fix it in the same PR.
