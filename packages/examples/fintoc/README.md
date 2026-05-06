# @mcify/example-fintoc

Reference MCP server for [Fintoc](https://fintoc.com) — open banking for Chile and Mexico — built with [mcify](https://mcify.dev).

> **Status:** alpha. Reference example for "how do I expose a banking API as an MCP server."

[Leer en español](./README.es.md)

## What it does

Exposes three MCP tools that any compatible client (Claude Desktop, Cursor, Claude Code, Lelemon Agentes, custom agents) can invoke:

| Tool                         | What it does                                                                      |
| ---------------------------- | --------------------------------------------------------------------------------- |
| `fintoc_list_accounts`       | List all accounts visible through a single Fintoc link (one end-user connection). |
| `fintoc_get_account_balance` | Get the available + current balance of one account.                               |
| `fintoc_list_movements`      | List bank movements for an account, with optional date range.                     |

Every tool is protected by:

- **`requireAuth`** — the calling agent must present a valid bearer token.
- **`rateLimit`** — 60–120/min per token (lower on movements because the responses are heavier).
- **`withTimeout`** — 5–10s deadlines.

The agent calling this server uses **its own** bearer token (`MCIFY_AUTH_TOKEN`). The Fintoc secret key (`FINTOC_SECRET_KEY`) lives on the server and never leaks to the agent.

## How Fintoc auth works

Fintoc has two credentials, both required:

1. **Secret key** (`sk_live_...` / `sk_test_...`) — your organization's API key. Lives on the mcify server as `FINTOC_SECRET_KEY`.
2. **Link token** — a per-user token issued at the end of Fintoc's bank-connection flow. Identifies which end-user connection to query.

Each tool in this server expects `linkToken` as an input. Your agent should hold or look up the right link token for the user it's helping (e.g. one row per user in your CRM).

## Run locally

```bash
# 1. Install deps (from the mcify monorepo root)
pnpm install

# 2. Get a Fintoc secret key
#    Sign in at https://app.fintoc.com
#    Settings → API keys → use sk_test_ for sandbox

# 3. Configure env vars
export FINTOC_SECRET_KEY='sk_test_...'
export MCIFY_AUTH_TOKEN="$(openssl rand -hex 32)"

# 4. Run with the inspector
mcify dev
```

The MCP endpoint is `http://localhost:8888/mcp`. The inspector UI lives at `http://localhost:3001`.

## Connect from Claude Desktop

Same config shape as the other mcify examples:

```json
{
  "mcpServers": {
    "fintoc": {
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

Restart Claude Desktop. Ask: "List the accounts for link `link_abc` and show me the balance of the checking account."

## Deploy

```bash
mcify deploy cloudflare      # Cloudflare Workers
mcify deploy vercel --prod   # Vercel Edge
mcify deploy fly             # Fly.io
mcify deploy railway         # Railway
mcify deploy docker --push   # Docker → registry
```

See [`docs/deploy/`](https://github.com/Lelemon-studio/mcify/tree/main/docs/deploy) for per-target details.

## Tests

```bash
pnpm --filter @mcify/example-fintoc test
```

Tests mock `fetch` against fixed JSON snapshots — no Fintoc credentials needed for CI.

## Files

```
src/
├── client.ts                   # FintocClient — minimal REST wrapper
├── client.test.ts              # Tests for the client
└── tools/
    ├── list-accounts.ts        # fintoc_list_accounts
    ├── get-account-balance.ts  # fintoc_get_account_balance
    └── list-movements.ts       # fintoc_list_movements
mcify.config.ts                 # MCP server config (auth, tools)
```

## Disclaimer

Not affiliated with or endorsed by Fintoc. This is a community-maintained connector built on Fintoc's public API.

## License

Apache-2.0 (same as mcify).
