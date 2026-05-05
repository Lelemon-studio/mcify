# @mcify/example-khipu

Reference MCP server for [Khipu](https://khipu.com) — Chilean bank-transfer payment links — built with [mcify](https://mcify.dev).

> **Status:** alpha. Used as the canonical example for "how do I expose a payment API as an MCP server" + dogfooded by Lelemon Agentes against Khipu sandbox.

## What it does

Exposes two MCP tools that any compatible client (Claude Desktop, Cursor, Claude Code, Lelemon Agentes, custom agents) can invoke:

| Tool                       | What it does                                                              |
| -------------------------- | ------------------------------------------------------------------------- |
| `khipu_create_payment`     | Creates a payment link. Returns a `paymentUrl` the customer opens to pay. |
| `khipu_get_payment_status` | Looks up a payment by id. Returns `status`, `amount`, `subject`, etc.     |

Both tools are protected by:

- **`requireAuth`** — the calling agent must present a valid bearer token.
- **`rateLimit`** — 60 creates / 120 lookups per minute per token.
- **`withTimeout`** — 5s deadline; Khipu typically responds in < 1s.

The agent calling this server uses **its own** bearer token (`MCIFY_AUTH_TOKEN`). The Khipu API key (`KHIPU_API_KEY`) is held by the server and never leaks to the agent.

## Run locally

```bash
# 1. Install deps (from the mcify monorepo root, or wherever you copied this)
pnpm install

# 2. Get a Khipu sandbox API key
#    Sign up at https://khipu.com/page/cuenta-cobrador-test
#    Generate a key at https://khipu.com/merchant/profile/api

# 3. Configure env vars
export KHIPU_API_KEY='your-merchant-key'
export MCIFY_AUTH_TOKEN="$(openssl rand -hex 32)"   # token your agent will use

# 4. Run with the inspector
mcify dev
```

The MCP endpoint is at `http://localhost:8888/mcp`. Inspector at `http://localhost:3001`.

Try it from the inspector's **Playground** tab:

```json
{
  "subject": "Test Order #1",
  "currency": "CLP",
  "amount": 12990
}
```

You'll get back a real Khipu sandbox payment URL.

## Run as a real server

```bash
mcify build --target node
node dist/server.mjs
```

Or deploy to Workers / Fly / Railway / Docker — see [mcify deploy targets](https://mcify.dev/deploy) (Phase D).

## Wire it to an agent

### Claude Desktop / Cursor

In your client's MCP config:

```jsonc
{
  "mcpServers": {
    "khipu": {
      "url": "https://your-deploy.example.com/mcp",
      "headers": {
        "authorization": "Bearer YOUR_MCIFY_AUTH_TOKEN",
      },
    },
  },
}
```

### Lelemon Agentes

Register the URL + token in `organization_mcp_servers`. Sofia (the WhatsApp agent) gets the `khipu_*` tools and can create payment links from a chat.

## Architecture (for contributors)

```
src/
├── client.ts              KhipuClient — thin fetch wrapper, snake_case ↔ camelCase mapping, KhipuApiError.
├── tools/
│   ├── create-payment.ts  defineTool(...) for khipu_create_payment.
│   └── get-payment-status.ts
└── index.ts               Re-exports for programmatic use.

mcify.config.ts            defineConfig — wires the client + tools, declares server-side auth.
```

The handler is **a one-liner**: `async (input) => client.createPayment(input)`. Schema validation, auth enforcement, rate limiting, timeouts — all of those are in the middleware layer or the boundary. The handler stays pure.

This is the pattern we recommend for any mcify connector you build.

## Tests

```bash
pnpm --filter @mcify/example-khipu test
```

The suite covers:

- Client unit tests with a `fetch` mock — verifies headers, body shape, error mapping.
- Tool integration tests via `createTestClient` from `@mcify/runtime/test` — same dispatch path as production HTTP.

No Khipu sandbox credentials are needed to run tests; everything is mocked.

## License

Apache 2.0. Use this as the starting point for your own MCP server (`mcify init --template example-khipu` once that template ships in Phase C.4).
