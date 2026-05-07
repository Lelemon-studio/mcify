# @mcify/example-bsale

Multi-tenant MCP server for [Bsale](https://www.bsale.io) — Chilean DTE / facturación electrónica — built with [mcify](https://mcify.dev).

> **Status:** alpha. Production shape: one deploy serves many businesses, each with their own Bsale `access_token`. The agent never holds the credential — only the bearer token issued at onboarding.

[Leer en español](./README.es.md)

## What it does

Exposes four MCP tools that any compatible client (Claude Desktop, Cursor, Claude Code, Lelemon Agentes, custom agents) can invoke against any Bsale-using business connected to the server:

| Tool                  | What it does                                                                           |
| --------------------- | -------------------------------------------------------------------------------------- |
| `bsale_emit_dte`      | Emit a tax document (factura/boleta) and get back its number, total, and PDF/XML URLs. |
| `bsale_list_invoices` | List issued documents. Filter by date range and document type.                         |
| `bsale_get_invoice`   | Look up a document by id. Returns the same shape as `bsale_emit_dte`.                  |
| `bsale_list_clients`  | Find clients by RUT or email.                                                          |

Every tool is protected by:

- **`requireAuth`** — the calling agent must present a valid bearer token registered in the session store.
- **`rateLimit`** — emit 30/min, reads 120–240/min per token (lower for emit because DTEs have legal weight).
- **`withTimeout`** — 5–15s deadlines.

## Architecture (multi-tenant)

```
        Bsale business A          Bsale business B          Bsale business C
              │                          │                          │
       access_token A             access_token B             access_token C
              │                          │                          │
              └──────────────┬───────────┴──────────────┬──────────┘
                             ▼                          ▼
                ┌─────────────────────────────────────────┐
                │          ONE mcify deploy               │
                │   ┌───────────────────────────────────┐ │
                │   │  BsaleSessionStore                │ │
                │   │  bearer_X → { orgId: "A",         │ │
                │   │              bsaleAccessToken }   │ │
                │   │  bearer_Y → { orgId: "B", ... }   │ │
                │   └───────────────────────────────────┘ │
                └────────────┬────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
       Claude Desktop  Claude Desktop  Claude Desktop
       Bearer = X      Bearer = Y      Bearer = Z
```

Each business presents **its own bearer token** (issued by the operator at onboarding). The server resolves bearer → org credentials and the handler uses the right Bsale token for that request. The agent **never sees** the upstream credential.

## Run locally (multi-tenant from day 1)

```bash
# 1. Install deps from the mcify monorepo root
pnpm install

# 2. Build (the admin CLI reads from dist/)
pnpm --filter @mcify/example-bsale build

# 3. Onboard your first business. The CLI generates a bearer token if
#    you don't pass one, and prints the Claude config snippet to hand over.
node scripts/admin.mjs add acme-corp \
  $(openssl rand -hex 32) \
  bs_xxxxxxxxxxxx_their_bsale_token

# 4. (Optional) onboard more orgs the same way:
node scripts/admin.mjs add second-business <bearer> <bsaleToken>

# 5. Run the dev server
pnpm dev
```

The session store lives at `./sessions.json` (override with `BSALE_SESSIONS_PATH`). For production, swap `JsonFileBsaleSessionStore` for a database-backed implementation (see "Storage" below).

The MCP endpoint is `http://localhost:8888/mcp`. The inspector lives at `http://localhost:3001`.

## Onboarding flow (what the operator does)

1. New business signs up (your channel: a form, an email, a partner program).
2. Business goes to `app.bsale.io` → **Configuración → API → "Crear Token"** and copies their `access_token`.
3. Operator receives the token (over a secure channel — never email).
4. Operator runs:

   ```bash
   node scripts/admin.mjs add <slug-of-business> <bearer-token-or-omit-to-generate> <bsale-access-token>
   ```

   The CLI prints the bearer token + the Claude Desktop snippet to send back.

5. Business pastes the snippet into Claude Desktop / Cursor / their agent. Restart. Tools appear.

To revoke access:

```bash
node scripts/admin.mjs revoke <bearer-token>
```

To list current sessions:

```bash
node scripts/admin.mjs list
```

## How the business connects (Claude Desktop)

The operator hands them this config:

```json
{
  "mcpServers": {
    "bsale": {
      "url": "https://bsale-mcp.your-host.com/mcp",
      "headers": {
        "authorization": "Bearer THE_BEARER_THE_OPERATOR_PROVISIONED"
      }
    }
  }
}
```

That's all. They paste it into `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows), restart, and ask: "Emite una factura electrónica para Acme SpA, RUT 11.111.111-1, por un ítem a 50000 CLP."

## Storage

The connector ships two storage adapters:

| Adapter                     | When to use                                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `MemoryBsaleSessionStore`   | Tests, local dev. Resets on every restart.                                                                       |
| `JsonFileBsaleSessionStore` | Single-host deploys with a writable filesystem (Fly volumes, Railway disks, a self-hosted box). Default for dev. |

For production at scale (many orgs, multi-host, HA): implement the `BsaleSessionStore` interface against your real datastore (Postgres, Cloudflare D1, KV, DynamoDB) and inject it in `mcify.config.ts` instead of the JSON-file one. The interface is small:

```ts
interface BsaleSessionStore {
  resolveBearer(bearerToken: string): Promise<BsaleSession | null>;
}
```

The admin store (used by the CLI) extends it with `add`, `revoke`, `list`. See [`src/sessions.ts`](./src/sessions.ts).

## Security model

- **The Bsale `access_token` never leaves the server.** Even the agent invoking a tool can't see it — handlers fetch it from the store using the validated bearer token, never from the request envelope.
- **Bearer tokens are validated at the boundary** before any handler runs. Unknown / revoked tokens get a 401.
- **No `orgId` field in tool inputs.** The server resolves the org from the bearer; the agent can't impersonate another org by passing a different `orgId`.
- **Revocation is a single CLI call.** Revoked tokens are rejected at the boundary by the next request.

## Deploy

This is a multi-tenant production service, so you'll want a target with persistent storage:

```bash
mcify deploy fly                         # default region scl, scale-to-zero
# or
mcify deploy railway                     # if you're already on Railway
# or
mcify deploy docker --push               # then helm install ./charts/mcify with a PVC
```

Cloudflare Workers / Vercel Edge are NOT recommended for this connector with the default `JsonFileBsaleSessionStore` — they don't have a writable filesystem. Either pair the deploy with a DB-backed store you implement (Cloudflare D1, KV) or pick a target with disk.

Per-target details: [docs.mcify.dev/deploy](https://docs.mcify.dev/deploy/overview/).

## Tests

```bash
pnpm --filter @mcify/example-bsale test
```

19 tests cover the Bsale REST client (mocked `fetch`), the in-memory session store, and the JSON-file session store (file persistence + atomic writes). No Bsale credentials are needed.

## Files

```
src/
├── client.ts              # BsaleClient — minimal REST wrapper
├── client.test.ts         # 6 tests
├── sessions.ts            # SessionStore interface + Memory + JsonFile impls + sessionFromContext helper
├── sessions.test.ts       # 13 tests
└── tools/
    ├── emit-dte.ts        # bsale_emit_dte
    ├── list-invoices.ts   # bsale_list_invoices
    ├── get-invoice.ts     # bsale_get_invoice
    └── list-clients.ts    # bsale_list_clients
scripts/
└── admin.mjs              # CLI: add / revoke / list orgs
mcify.config.ts            # bearer({ verify }) → SessionStore lookup
```

## Why this is the canonical multi-tenant pattern

This connector is the reference for any "MCPs as a service" play built on mcify:

- **One operator** (you) hosts a single deploy.
- **Many businesses** sign up, hand over their upstream credential at onboarding.
- **Many agents** (one per business, possibly many users per business) connect with their own bearer tokens.
- **No credential leakage**: upstream tokens stay server-side, indexed by bearer.

The same pattern applies to any vendor with per-tenant API keys — Stripe Connect (sub-merchant), HubSpot per-portal, your own SaaS API. Swap "Bsale" for the vendor and the connector skeleton stays.

## Disclaimer

Not affiliated with or endorsed by Bsale. This is a community-maintained connector built on Bsale's public API.

## License

Apache-2.0 (same as mcify).
