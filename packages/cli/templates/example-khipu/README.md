# {{name}}

Khipu (Chile) MCP server, scaffolded from the `example-khipu` mcify template.

Exposes two tools that AI agents can invoke:

| Tool                       | What it does             |
| -------------------------- | ------------------------ |
| `khipu_create_payment`     | Creates a payment link   |
| `khipu_get_payment_status` | Looks up a payment by id |

## Setup

```bash
pnpm install

# 1. Get a Khipu merchant API key
#    https://khipu.com/merchant/profile/api → "Crear nueva API Key"

# 2. Configure env
export KHIPU_API_KEY='your-merchant-key'
export MCIFY_AUTH_TOKEN="$(openssl rand -hex 32)"

# 3. Run
pnpm dev
```

The MCP server listens at `http://localhost:8888/mcp`. The mcify inspector opens at `http://localhost:3001` — open it to see your tools, the live calls log, and the Playground for invoking by hand.

## Wire to an agent

### Claude Desktop / Cursor / Claude Code

```jsonc
{
  "mcpServers": {
    "khipu": {
      "url": "http://localhost:8888/mcp",
      "headers": {
        "authorization": "Bearer YOUR_MCIFY_AUTH_TOKEN",
      },
    },
  },
}
```

For production, replace the URL with your deployed server (see "Deploy" below).

### Lelemon Agentes

Register the URL + token in `organization_mcp_servers`. The agent gets the `khipu_*` tools and can create payment links from a chat.

## Customize

The intended workflow is to **read [`AGENTS.md`](./AGENTS.md), then ask Claude Code (or your AI assistant) to add tools as you need them.** AGENTS.md is the contract that makes the agent generate consistent code.

A typical extension:

> "Agregá un tool `khipu_list_payments` que liste los últimos N pagos. Usa `schema.paginated` del helper."

The agent will:

1. Add the appropriate method to `src/client.ts`.
2. Create `src/tools/list-payments.ts` following the canonical pattern.
3. Register it in `mcify.config.ts`.
4. Add a test in `src/tools/list-payments.test.ts`.

## Test

```bash
pnpm test
```

Tests use a mock `fetch`, no live Khipu calls needed.

## Build for production

```bash
pnpm build              # outputs dist/server.mjs
node dist/server.mjs
```

## Deploy

Cloudflare Workers, Fly.io, Railway, Docker — see `mcify deploy` (Phase D).

## Architecture

```
src/
├── client.ts          KhipuClient — single place that touches the Khipu API.
├── tools/
│   ├── create-payment.ts
│   └── get-payment-status.ts
└── index.ts           Re-exports for programmatic use.

mcify.config.ts        Wires KhipuClient + tools, declares MCP-side bearer auth.
```

The handler of every tool is **a one-liner**: `async (input) => client.someMethod(input)`. Auth, rate limiting, timeouts and Zod validation all live in middleware or at the boundary. Handlers stay pure.

## License

This template is Apache 2.0 (inherited from mcify). Your project is yours — change the LICENSE if you need.

## Docs

- mcify: https://mcify.dev
- Reference connector this template was forked from: https://github.com/Lelemon-studio/mcify/tree/main/packages/examples/khipu
- Khipu API: https://docs.khipu.com/portal/en/kb/khipu-api
