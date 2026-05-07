# @mcify/example-fintoc

Multi-tenant MCP server for [Fintoc](https://fintoc.com) — open banking for Chile and México — built with [mcify](https://mcify.dev).

> **Status:** alpha. Production shape: one deploy serves many businesses, each with their own Fintoc `secret_key` and a set of per-end-user `link_token`s. The agent never holds either credential — only the bearer token issued at onboarding.

[Leer en español](./README.es.md)

## What it does

Exposes four MCP tools that any compatible client (Claude Desktop, Cursor, Claude Code, Lelemon Agents, custom agents) can invoke against any Fintoc-using business connected to the server:

| Tool                         | What it does                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `fintoc_list_accounts`       | List all bank accounts visible through one end-user's Fintoc link, with holder, currency, and balances.       |
| `fintoc_get_account_balance` | Get the available + current balance of a single account.                                                      |
| `fintoc_list_movements`      | List bank movements for an account. Date range filter, automatic cursor pagination, sender/recipient mapping. |
| `fintoc_refresh_movements`   | Trigger an on-demand refresh so movements reflect what happened minutes ago. Asynchronous (webhook delivery). |

Every tool is protected by:

- **`requireAuth`** — the calling agent must present a valid bearer token registered in the session store.
- **`rateLimit`** — reads 60–120/min, refresh 5/min per token.
- **`withTimeout`** — 5–15s deadlines.

## Why two credentials (and what `userKey` is)

Fintoc's auth model is two-layered:

1. **Org-level `secret_key`** (`sk_test_…` / `sk_live_…`) — one per Fintoc account. Authorises the API call.
2. **Per-end-user `link_token`** — issued by the Fintoc Widget when an end-user (e.g. one of the org's customers) connects their bank account. Scopes queries to that end-user's accounts.

The connector exposes a **stable, opaque `userKey`** (the org's RUT for the end-user, an internal id, anything) as the tool input. The session store maps `(bearer → org → userKey → link_token)` server-side. The agent talks about users by `userKey`; it never sees or chooses the `link_token`.

## Architecture (multi-tenant)

```
       Fintoc business A             Fintoc business B
       ───────────────────           ───────────────────
       secret_key A                  secret_key B
       link_token user A1            link_token user B1
       link_token user A2            link_token user B2
              │                              │
              └──────────────┬──────────────┘
                             ▼
             ┌─────────────────────────────────────────┐
             │          ONE mcify deploy               │
             │   ┌───────────────────────────────────┐ │
             │   │  FintocSessionStore               │ │
             │   │  bearer_X → {                     │ │
             │   │    orgId: "A",                    │ │
             │   │    secretKey: sk_test_...,        │ │
             │   │    linkTokens: {                  │ │
             │   │      "11.111.111-1": link_...,    │ │
             │   │      "22.222.222-2": link_...     │ │
             │   │    }                              │ │
             │   │  }                                │ │
             │   │  bearer_Y → { orgId: "B", ... }   │ │
             │   └───────────────────────────────────┘ │
             └────────────┬────────────────────────────┘
                          │
           ┌──────────────┼──────────────┐
           ▼              ▼              ▼
    Claude Desktop  Claude Desktop  Claude Desktop
    Bearer = X      Bearer = Y      Bearer = Z
```

## End-user link flow (where `link_token`s come from)

The connector itself does **not** present the Fintoc Widget — that is the business's responsibility. The data path is:

```
Business backend ─→ creates a Link via Fintoc API/dashboard ─→ widgetToken
Business frontend ─→ loads @fintoc/fintoc-js widget ─→ end-user enters bank credentials
Fintoc backend ─→ MFA, validation ─→ issues link_token ─→ POST webhook to business backend
Business operator ─→ pnpm admin add-link <bearer> <userKey> <link_token>
```

From that point on, the business's agent can call `fintoc_list_movements` with the `userKey` it already knows. The connector resolves the `link_token` server-side.

## Run locally

```bash
# 1. Install deps from the mcify monorepo root
pnpm install

# 2. Onboard your first business. The CLI generates a bearer if you don't
#    pass one, and prints the Claude Desktop snippet to hand over.
pnpm --filter @mcify/example-fintoc admin add-org acme-corp sk_test_xxxxxxxx

# 3. Bind one or more end-user link_tokens under stable userKeys:
pnpm --filter @mcify/example-fintoc admin add-link <bearer> 11.111.111-1 link_xxx
pnpm --filter @mcify/example-fintoc admin add-link <bearer> 22.222.222-2 link_yyy

# 4. Run the dev server
pnpm --filter @mcify/example-fintoc dev
```

The session store lives at `./sessions.json` (override with `FINTOC_SESSIONS_PATH`). For production, swap `JsonFileFintocSessionStore` for a database-backed implementation (see "Storage" below).

The MCP endpoint is `http://localhost:8888/mcp`. The inspector lives at `http://localhost:3001`.

## Onboarding flow (what the operator does)

1. New business signs up (your channel: a form, an email, a partner program).
2. Business goes to `app.fintoc.com` → **Settings → API keys** and copies their `secret_key` (`sk_test_…` for sandbox, `sk_live_…` for production).
3. Operator receives the secret over a secure channel (never email).
4. Operator runs:

   ```bash
   pnpm admin add-org <slug-of-business> <secret_key> [bearer-token-or-omit-to-generate]
   ```

   The CLI prints the bearer token + the Claude Desktop snippet to send back.

5. Each time an end-user of the business completes the Fintoc Widget flow, the business backend receives a webhook with the `link_token`. The operator (or an automated job) registers it:

   ```bash
   pnpm admin add-link <bearer> <stable-userKey> <link_token>
   ```

To revoke an entire org:

```bash
pnpm admin revoke-org <bearer>
```

To revoke a single end-user binding (the org keeps working for the rest):

```bash
pnpm admin revoke-link <bearer> <userKey>
```

To list sessions:

```bash
pnpm admin list
```

## How the business connects (Claude Desktop)

The operator hands them this config:

```json
{
  "mcpServers": {
    "fintoc": {
      "url": "https://fintoc-mcp.your-host.com/mcp",
      "headers": {
        "authorization": "Bearer THE_BEARER_THE_OPERATOR_PROVISIONED"
      }
    }
  }
}
```

They paste it into `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows), restart, and ask: "Show me the last 30 days of movements for user 11.111.111-1."

## What's covered (and what isn't)

| Fintoc product               | Endpoints                                                        | Status                      |
| ---------------------------- | ---------------------------------------------------------------- | --------------------------- |
| Movements / Data Aggregation | `/v1/accounts`, `/v1/accounts/:id`, `/v1/accounts/:id/movements` | ✅ — with cursor pagination |
| Refresh Intents              | `POST /v1/refresh_intents`                                       | ✅                          |
| Smart Checkout               | `POST /v2/checkout_sessions`, payment intents                    | Roadmap                     |
| Subscriptions / Recurring    | Subscription intents                                             | Roadmap                     |
| Transfers / Payouts          | `/v1/transfers` (requires JWS keys)                              | Out of scope                |
| Direct Debit                 | `/v1/direct_debits`                                              | Out of scope                |

The connector pins the `Fintoc-Version` header (currently `2026-02-01`) so behaviour is stable across Fintoc API rollouts. Override per-org via the `fintocVersion` field on the session.

## Currency and amount semantics

All `amount` and `balance` values are **integers in the smallest unit of the currency**:

- `CLP` has no decimals — values are whole pesos. `25000` means `$25.000 CLP`.
- `MXN` is in cents — `25000` means `$250.00 MXN`.

Negative values are outbound movements. Inbound movements expose `senderAccount`; outbound expose `recipientAccount`.

## Storage

The connector ships two storage adapters:

| Adapter                      | When to use                                                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `MemoryFintocSessionStore`   | Tests, local dev. Resets on every restart.                                                                       |
| `JsonFileFintocSessionStore` | Single-host deploys with a writable filesystem (Fly volumes, Railway disks, a self-hosted box). Default for dev. |

For production at scale (many orgs, multi-host, HA): implement the `FintocSessionStore` interface against your real datastore (Postgres, Cloudflare D1, KV, DynamoDB) and inject it in `mcify.config.ts` instead of the JSON-file one. The interface is small:

```ts
interface FintocSessionStore {
  resolveBearer(bearerToken: string): Promise<FintocSession | null>;
}
```

The admin store (used by the CLI) extends it with `add`, `revoke`, `addLink`, `revokeLink`, `list`. See [`src/sessions.ts`](./src/sessions.ts).

## Security model

- **The Fintoc `secret_key` and `link_token`s never leave the server.** Even the agent invoking a tool can't see them — handlers fetch them from the store using the validated bearer, never from the request envelope.
- **No `linkToken` in tool inputs.** The agent passes a stable `userKey`; the server resolves the actual link. This prevents an LLM from inventing or cross-pollinating link tokens.
- **No `orgId` in tool inputs.** The server resolves the org from the bearer; the agent can't impersonate another org.
- **Bearer tokens are validated at the boundary** before any handler runs. Unknown / revoked tokens get a 401.
- **Revocation is a single CLI call.** Org-level (`revoke-org`) or per-end-user (`revoke-link`).

## Deploy

Multi-tenant production service — pick a target with persistent storage:

```bash
mcify deploy fly                         # default region scl, scale-to-zero
# or
mcify deploy railway                     # if you're already on Railway
# or
mcify deploy docker --push               # then helm install ./charts/mcify with a PVC
```

Cloudflare Workers / Vercel Edge are NOT recommended with the default `JsonFileFintocSessionStore` — they don't have a writable filesystem. Either pair the deploy with a DB-backed store you implement (Cloudflare D1, KV) or pick a target with disk.

Per-target details: [docs.mcify.dev/deploy](https://docs.mcify.dev/deploy/overview/).

## Tests

```bash
pnpm --filter @mcify/example-fintoc test
```

41 tests cover the Fintoc REST client (mocked `fetch`, including pagination via the `Link` header and `Fintoc-Version` pinning), the in-memory session store, and the JSON-file session store (file persistence + atomic writes). No Fintoc credentials are needed.

## Files

```
src/
├── client.ts              # FintocClient — REST wrapper with versioning + cursor pagination
├── client.test.ts         # 12 tests
├── sessions.ts            # SessionStore interface + Memory + JsonFile impls + sessionFromContext + getLinkToken
├── sessions.test.ts       # 29 tests
└── tools/
    ├── list-accounts.ts        # fintoc_list_accounts
    ├── get-account-balance.ts  # fintoc_get_account_balance
    ├── list-movements.ts       # fintoc_list_movements
    └── refresh-movements.ts    # fintoc_refresh_movements
scripts/
└── admin.ts               # CLI: add-org / add-link / revoke-* / list
mcify.config.ts            # bearer({ verify }) → SessionStore lookup
```

## Why this is the canonical two-credential multi-tenant pattern

Many vendors split credentials similarly: an org-level API key + a per-end-user token (Plaid item access, Stripe Connect account, Salesforce per-org-per-user). This connector is the reference for that shape:

- **One operator** (you) hosts a single deploy.
- **Many businesses** sign up, hand over their org-level credential at onboarding.
- **Many end-users** per business get their per-user tokens registered as the business onboards them.
- **Many agents** connect with their bearer + ask about end-users by stable `userKey`.
- **No credential leakage**: org and per-user secrets stay server-side, indexed by bearer + userKey.

## Disclaimer

Not affiliated with or endorsed by Fintoc. This is a community-maintained connector built on Fintoc's public API.

## License

Apache-2.0 (same as mcify).
