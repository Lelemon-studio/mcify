<div align="center">

# mcify

### AI-ready your software in minutes.

Open source platform to expose any API as a [Model Context Protocol](https://modelcontextprotocol.io) server.<br/>
CLI-first · Type-safe (Zod end-to-end) · Edge-deployable · Built for AI-agent workflows.

[![npm](https://img.shields.io/npm/v/%40mcify%2Fcli/alpha?label=%40mcify%2Fcli&color=fde047)](https://www.npmjs.com/package/@mcify/cli)
[![CI](https://github.com/Lelemon-studio/mcify/actions/workflows/ci.yml/badge.svg)](https://github.com/Lelemon-studio/mcify/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](./LICENSE)
[![Made with TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](https://www.typescriptlang.org/)

[Website](https://mcify.dev) · [Docs](#quick-start) · [llms.txt](https://mcify.dev/llms.txt) · [Discussions](https://github.com/Lelemon-studio/mcify/discussions)

</div>

---

## What is mcify

mcify is to MCP servers what [Hono](https://hono.dev) is to HTTP servers: a small, opinionated framework that handles the protocol boilerplate so you only write your tools' business logic.

```ts
import { defineTool, schema } from '@mcify/core';
import { requireAuth, rateLimit } from '@mcify/core/middleware';
import { z } from 'zod';

export const createPayment = defineTool({
  name: 'khipu_create_payment',
  description: 'Create a Khipu payment link',
  middlewares: [requireAuth(), rateLimit({ max: 60, windowMs: 60_000 })],
  input: z.object({
    subject: z.string().min(1),
    currency: z.enum(['CLP', 'USD']),
    amount: z.number().positive(),
  }),
  output: z.object({
    paymentId: z.string(),
    paymentUrl: schema.httpUrl(),
  }),
  handler: async (input, ctx) => {
    return ctx
      .fetch('https://payment-api.khipu.com/v3/payments', {
        method: 'POST',
        headers: { 'x-api-key': process.env.KHIPU_API_KEY },
        body: JSON.stringify(input),
      })
      .then((r) => r.json());
  },
});
```

That handler is **a one-liner**. Auth, rate limiting, schema validation, and edge deployment are framework concerns.

## Quick start

```bash
npx @mcify/cli@alpha init my-mcp
cd my-mcp
pnpm install
pnpm dev
```

Two URLs print:

| URL                         | What it is                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `http://localhost:8888/mcp` | Your MCP server. Connect Claude Desktop, Cursor, Claude Code, or any MCP client.         |
| `http://localhost:3001`     | The mcify inspector — tools list, live calls log, playground for invoking tools by hand. |

The scaffold ships an `AGENTS.md` so AI assistants (Claude Code, Cursor, Cody, Windsurf, Copilot Workspace) follow the project's conventions automatically.

## Why mcify

- **Type-safe end-to-end** — One Zod schema is your handler args, JSON Schema for `tools/list`, and a generated client. No drift between layers.
- **Edge-first** — Same handler runs on Cloudflare Workers, Vercel Edge, Bun, Node, or Docker. Adapters in the runtime; no rewrites.
- **AI-agent-aware** — `AGENTS.md` template + `.claude/commands/` for slash commands. Claude Code already knows how to add a tool to your project.
- **Composable middleware** — `requireAuth`, `rateLimit`, `withTimeout` ship in core. Wrap any tool. Compose like Express/Hono.
- **Built-in inspector** — `mcify dev` opens a local web UI with tools, live calls, playground. No extra setup.
- **Deploy in one command** — `mcify deploy cloudflare`, `vercel`, or `docker`. Pre-flight bundle size checks for edge runtimes.
- **Self-host or cloud** — Apache 2.0 OSS today. [`mcify.cloud`](https://mcify.dev) hosted SaaS later for vendors who don't want to manage infra.

## Deploy

```bash
mcify deploy cloudflare              # Cloudflare Workers, via wrangler
mcify deploy vercel --prod           # Vercel Edge Functions, via vercel CLI
mcify deploy docker --tag :latest    # Multi-stage Dockerfile + docker build
```

Pre-flight checks: bundle size warnings for the 1 MB / 4 MB / 10 MB limits each platform enforces.

## Test without the network

```ts
import { createTestClient } from '@mcify/runtime/test';
import { vi } from 'vitest';
import config from './mcify.config.js';

const client = createTestClient(config, {
  auth: { type: 'bearer', token: 'test' },
  fetch: vi.fn().mockResolvedValue(new Response('{...}')),
});

await client.invokeTool('khipu_create_payment', {
  /* ... */
});
```

Same dispatch path as production HTTP — no protocol mocks, no flakiness.

## Packages

| Package                                                              | Role                                                                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [`@mcify/cli`](https://www.npmjs.com/package/@mcify/cli)             | The `mcify` binary: `init`, `dev`, `build`, `deploy`, `generate`.                                                  |
| [`@mcify/core`](https://www.npmjs.com/package/@mcify/core)           | Builder library: `defineTool`, `defineResource`, `definePrompt`, `defineConfig`, schema helpers, auth, middleware. |
| [`@mcify/runtime`](https://www.npmjs.com/package/@mcify/runtime)     | MCP server runtime: stdio + HTTP transports, multi-target adapters, event bus, optional Pino logger.               |
| [`@mcify/inspector`](https://www.npmjs.com/package/@mcify/inspector) | Local web inspector served by `mcify dev`.                                                                         |

Use the `@alpha` dist-tag while we cut V1.

## Examples

| Connector                                                  | Status                                            |
| ---------------------------------------------------------- | ------------------------------------------------- |
| [Khipu](./packages/examples/khipu) — Chilean payment links | done live · `mcify init --template example-khipu` |
| Bsale — Chilean DTE / billing                              | planned                                           |
| Fintoc — banking aggregation                               | planned                                           |

## Roadmap

| Phase                            | Status       | What ships                                                             |
| -------------------------------- | ------------ | ---------------------------------------------------------------------- |
| A. Core lib + CLI                | done         | `init`, `dev`, `build`, `generate` end-to-end with hot reload          |
| B. Inspector                     | done slice 1 | Local web UI with tools, calls log, playground                         |
| C. Examples + AGENTS.md template | done         | Khipu connector, AGENTS.md in `from-scratch`, `example-khipu` template |
| D. Deploy targets                | done slice 1 | Cloudflare Workers, Vercel Edge, Docker (Fly + Railway next)           |
| E. mcify Cloud                   | V2           | Multi-tenant hosting at `mcify.cloud`                                  |
| F. Marketplace                   | V2           | Shared registry of community MCPs at `mcify.dev/registry`              |

## For AI agents

Working on this codebase with Claude Code, Cursor, or any other AI assistant?

- **[AGENTS.md](./AGENTS.md)** — universal contract: invariants, conventions, anti-patterns we've already hit.
- **[CLAUDE.md](./CLAUDE.md)** — Claude Code specific (slash commands, subagents).
- **[`.claude/commands/`](./.claude/commands/)** — `/check`, `/release`, `/add-tool` slash commands.
- **[llms.txt](https://mcify.dev/llms.txt)** — dense LLM-optimized summary of the API surface.
- **[ADRs](./docs/decisions/)** — architectural decisions, why we chose what we chose.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup and guidelines. By participating, you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

Releases are managed with [Changesets](https://github.com/changesets/changesets) — see [`.changeset/README.md`](./.changeset/README.md) for the flow.

## Security

To report a vulnerability, follow the process in [SECURITY.md](./SECURITY.md). **Do not** open public issues for security concerns.

## License

Apache 2.0. See [LICENSE](./LICENSE).

---

<div align="center">

Built by [Lelemon Studio](https://lelemon.cl) in Santiago, Chile.

</div>
