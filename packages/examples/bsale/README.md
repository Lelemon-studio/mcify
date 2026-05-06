# @mcify/example-bsale

Reference MCP server for [Bsale](https://www.bsale.io) — Chilean DTE / facturación electrónica — built with [mcify](https://mcify.dev).

> **Status:** alpha. Reference example for "how do I expose a billing API as an MCP server."

[Leer en español](./README.es.md)

## What it does

Exposes four MCP tools that any compatible client (Claude Desktop, Cursor, Claude Code, Lelemon Agentes, custom agents) can invoke:

| Tool                  | What it does                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `bsale_emit_dte`      | Emit a tax document (factura/boleta) and get back its number, total, and PDF/XML URLs.   |
| `bsale_list_invoices` | List issued documents. Filter by date range and document type.                           |
| `bsale_get_invoice`   | Look up a document by id. Returns the same shape as `bsale_emit_dte`.                    |
| `bsale_list_clients`  | Find clients by RUT or email — the connector picks the right Bsale field based on shape. |

Every tool is protected by:

- **`requireAuth`** — the calling agent must present a valid bearer token.
- **`rateLimit`** — emit 30/min, reads 120-240/min per token (lower for emit because DTEs have legal weight).
- **`withTimeout`** — 5–15s deadlines.

The agent calling this server uses **its own** bearer token (`MCIFY_AUTH_TOKEN`). The Bsale access token (`BSALE_ACCESS_TOKEN`) lives on the server and never leaks to the agent.

## Run locally

```bash
# 1. Install deps (from the mcify monorepo root)
pnpm install

# 2. Get a Bsale access token
#    Sign in at https://app.bsale.io
#    Configuración → API → "Crear Token"

# 3. Configure env vars
export BSALE_ACCESS_TOKEN='your-bsale-token'
export MCIFY_AUTH_TOKEN="$(openssl rand -hex 32)"   # token your agent will use

# 4. Run with the inspector
mcify dev
```

The MCP endpoint is `http://localhost:8888/mcp`. The inspector UI lives at `http://localhost:3001`.

## Connect from Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "bsale": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-fetch"],
      "env": {
        "MCP_URL": "http://localhost:8888/mcp",
        "MCP_AUTH": "Bearer YOUR_MCIFY_AUTH_TOKEN"
      }
    }
  }
}
```

Restart Claude Desktop. Ask: "Emit a factura electrónica for Acme SpA, RUT 11.111.111-1, for one item at 50000 CLP."

## Document types

Bsale uses numeric `documentTypeId` values that map to SII codes. Common ones:

| `documentTypeId` | SII | Tipo                        |
| ---------------- | --- | --------------------------- |
| 33               | 33  | Factura electrónica         |
| 34               | 34  | Factura exenta electrónica  |
| 39               | 39  | Boleta electrónica          |
| 41               | 41  | Boleta exenta electrónica   |
| 56               | 56  | Nota de débito electrónica  |
| 61               | 61  | Nota de crédito electrónica |

The full list is exposed by Bsale at `GET /v1/document_types.json`. Use that to discover your account's actual ids — they can vary per merchant.

## Deploy

Same one-command flow as any mcify server:

```bash
mcify deploy cloudflare      # Cloudflare Workers
mcify deploy vercel --prod   # Vercel Edge
mcify deploy fly             # Fly.io
mcify deploy railway         # Railway
mcify deploy docker --push   # Docker → registry
```

See [docs.mcify.dev/deploy](https://docs.mcify.dev/deploy/overview/) for per-target details.

## Tests

```bash
pnpm --filter @mcify/example-bsale test
```

Tests mock `fetch` against fixed JSON snapshots — no Bsale credentials needed for CI.

## Files

```
src/
├── client.ts              # BsaleClient — minimal REST wrapper
├── client.test.ts         # Tests for the client
└── tools/
    ├── emit-dte.ts        # bsale_emit_dte
    ├── list-invoices.ts   # bsale_list_invoices
    ├── get-invoice.ts     # bsale_get_invoice
    └── list-clients.ts    # bsale_list_clients
mcify.config.ts            # MCP server config (auth, tools)
```

## Disclaimer

Not affiliated with or endorsed by Bsale. This is a community-maintained connector built on Bsale's public API.

## License

Apache-2.0 (same as mcify).
