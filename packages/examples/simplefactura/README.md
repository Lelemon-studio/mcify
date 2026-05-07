# @mcify/example-simplefactura

Multi-tenant MCP server for [SimpleFactura](https://www.simplefactura.cl) — Chilean electronic invoicing (DTE, BHE) — built with [mcify](https://mcify.dev).

> **Status:** alpha. Production shape: one deploy serves many SimpleFactura accounts, and each account can operate many empresas (companies). The agent never holds the credentials — only the bearer token issued at onboarding.

[Leer en español](./README.es.md)

## What it does

Exposes 13 MCP tools that any compatible client (Claude Desktop, Cursor, Claude Code, Lelemon Agents, custom agents) can invoke against any SimpleFactura account connected to the server.

### Emisión

| Tool                             | What it does                                                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `simplefactura_emit_dte`         | Emit a factura/boleta (33, 34, 39, 41) with a vendor-agnostic `DteInput`. The connector composes the SII shape and calculates totales. |
| `simplefactura_emit_credit_note` | Emit a Nota de Crédito (61) or Débito (56) with an obligatory reference to the original document.                                      |

### Lectura

| Tool                                    | What it does                                              |
| --------------------------------------- | --------------------------------------------------------- |
| `simplefactura_list_documents`          | List issued DTEs with date range / type / folio filters.  |
| `simplefactura_get_document`            | Look up a single DTE by folio + tipo.                     |
| `simplefactura_list_received_documents` | List DTEs received from suppliers (purchases).            |
| `simplefactura_list_clients`            | List the company's customer catalog.                      |
| `simplefactura_get_client_by_rut`       | Find a customer by RUT.                                   |
| `simplefactura_list_products`           | List the company's product catalog.                       |
| `simplefactura_list_branch_offices`     | List registered sucursales.                               |
| `simplefactura_get_company_info`        | Get the emisor profile (RUT, razón social, giro, ACTECO). |

### Boletas de Honorarios

| Tool                              | What it does                                                           |
| --------------------------------- | ---------------------------------------------------------------------- |
| `simplefactura_list_bhe_issued`   | List BHE the company has issued (typical freelancer / consultor case). |
| `simplefactura_list_bhe_received` | List BHE received from service providers.                              |

### Folios

| Tool                         | What it does                                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `simplefactura_check_folios` | Returns how many folios are available for a given DTE type. Lets the agent warn the user before mass-emitting. |

Every tool is protected by:

- **`requireAuth`** — the calling agent must present a valid bearer token registered in the session store.
- **`rateLimit`** — emisión 30/min, NC/ND 15/min, reads 60–120/min per token.
- **`withTimeout`** — 5–15s deadlines.

## Why two-level multi-tenant (one credential → many empresas)

SimpleFactura is unusual in the Chilean ecosystem: a single user account (email + password) can operate many companies. Each business endpoint receives a `Credenciales` object that names which company to act on (`RutEmisor`).

The connector models this with two levels:

```
bearer token  →  org id (one SimpleFactura account: email + password)
              →  cached JWT (auto-refreshed)
              →  empresas: { userKey → { rutEmisor, ... } }
```

This makes the **accountant-PyME case** a first-class citizen: one accountant operates 10 small companies from a single deploy, and the agent picks the right one with a `userKey`.

```
       SimpleFactura account A         SimpleFactura account B
       ─────────────────────────       ─────────────────────────
       email + password A              email + password B
       empresa "main"                  empresa "cliente-1"
                                        empresa "cliente-2"
                                        empresa "cliente-3"
              │                                 │
              └──────────────┬──────────────────┘
                             ▼
             ┌─────────────────────────────────────────┐
             │          ONE mcify deploy               │
             │   ┌───────────────────────────────────┐ │
             │   │  SimpleFacturaSessionStore        │ │
             │   │  bearer_X → {                     │ │
             │   │    orgId: "lelemon",              │ │
             │   │    email + password,              │ │
             │   │    cachedToken,                   │ │
             │   │    empresas: { main: {...} }      │ │
             │   │  }                                │ │
             │   │  bearer_Y → {                     │ │
             │   │    orgId: "contador-perez",       │ │
             │   │    empresas: {                    │ │
             │   │      cliente-1: { rutEmisor },    │ │
             │   │      cliente-2: { rutEmisor },    │ │
             │   │      cliente-3: { rutEmisor }     │ │
             │   │    }                              │ │
             │   │  }                                │ │
             │   └───────────────────────────────────┘ │
             └────────────┬────────────────────────────┘
                          │
           ┌──────────────┼──────────────┐
           ▼              ▼              ▼
    Claude Desktop  Claude Desktop  WhatsApp / Lelemon Agents
    Bearer = X      Bearer = Y      Bearer = Z
```

## Run locally

```bash
# 1. Install deps from the mcify monorepo root
pnpm install

# 2. Onboard your first org. The CLI generates a bearer if you don't pass one.
pnpm --filter @mcify/example-simplefactura admin add-org \
  lelemon contacto@lelemon.cl your-password

# 3. Bind one or more empresas under stable userKeys:
pnpm --filter @mcify/example-simplefactura admin add-empresa \
  <bearer> main 76.000.000-0 26.429.782-6 "Casa Matriz"

# 4. (Optional) pin a default empresa so tools without `userKey` work:
pnpm --filter @mcify/example-simplefactura admin set-default <bearer> main

# 5. Run the dev server
pnpm --filter @mcify/example-simplefactura dev
```

The session store lives at `./sessions.json` (override with `SIMPLEFACTURA_SESSIONS_PATH`). For production at scale, swap `JsonFileSimpleFacturaSessionStore` for a database-backed implementation.

The MCP endpoint is `http://localhost:8888/mcp`. The inspector lives at `http://localhost:3001`.

## Onboarding flow (what the operator does)

1. New org signs up (your channel: a form, an email, a partner program).
2. Org provides their SimpleFactura account email + password.
3. Operator receives the credentials over a secure channel (never email).
4. Operator runs:

   ```bash
   pnpm admin add-org <orgId> <email> <password> [bearer-or-omit-to-generate]
   ```

   The CLI prints the bearer + the Claude Desktop snippet to send back.

5. Operator binds one or more empresas to that org:

   ```bash
   # Single-empresa case (most orgs):
   pnpm admin add-empresa <bearer> main 76.000.000-0
   pnpm admin set-default <bearer> main

   # Accountant case (one credential, many companies):
   pnpm admin add-empresa <bearer> cliente-1 11.111.111-1
   pnpm admin add-empresa <bearer> cliente-2 22.222.222-2
   ```

To revoke an entire org:

```bash
pnpm admin revoke-org <bearer>
```

To revoke a single empresa binding (the rest keep working):

```bash
pnpm admin revoke-empresa <bearer> <userKey>
```

To list sessions:

```bash
pnpm admin list
```

## Accountant case explicit

A Chilean accountant managing 10 small companies pastes the same SimpleFactura credentials once. The operator binds 10 empresas under stable `userKey`s:

```bash
pnpm admin add-org contador-perez accountant@firm.cl <password>
pnpm admin add-empresa <bearer> distribuidora-norte 76.000.000-0
pnpm admin add-empresa <bearer> dental-providencia 76.111.111-1
# ...8 more
```

The agent then talks about empresas by `userKey`:

> _"Cambia a `dental-providencia` y emite la boleta del mes a su cliente recurrente."_

The connector resolves `userKey="dental-providencia"` to its `rutEmisor` and `nombreSucursal` server-side, builds the `Credenciales` object SimpleFactura needs, and emits the DTE — all without exposing any credential to the LLM.

## How the org connects (Claude Desktop)

```json
{
  "mcpServers": {
    "simplefactura": {
      "url": "https://simplefactura-mcp.your-host.com/mcp",
      "headers": {
        "authorization": "Bearer THE_BEARER_THE_OPERATOR_PROVISIONED"
      }
    }
  }
}
```

They paste it into `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows), restart, and ask: _"Emite una boleta por $80.000 a Acme RUT 11.111.111-1."_

## What's covered (and what isn't)

| SimpleFactura product                                | Status                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| Facturación electrónica (33, 34, NC, ND, exenciones) | ✅ via `simplefactura_emit_dte` + `simplefactura_emit_credit_note` |
| Boletas electrónicas (39, 41)                        | ✅                                                                 |
| Boletas de Honorarios (BHE issued + received, list)  | ✅                                                                 |
| Documentos recibidos (compras)                       | ✅                                                                 |
| Folios — consultar disponibles                       | ✅                                                                 |
| Catálogo (clientes, productos, sucursales)           | ✅                                                                 |
| Datos empresa (`/datosEmpresa`)                      | ✅                                                                 |
| **Folios — solicitar al SII**                        | Roadmap (POST `/folios/solicitar`)                                 |
| **Emisión masiva (multipart CSV)**                   | Roadmap (`/massiveInvoice`)                                        |
| **Guías de despacho electrónicas (52)**              | Out of scope v1 — caso PyME mediana                                |
| **DTEs de exportación (110, 111, 112)**              | Out of scope v1                                                    |

## Vendor-agnostic types

The input/output types (`DteInput`, `DteResult`, `DteItem`, `DteReceptor`, `DteDescuentoGlobal`) are designed to be **portable** across the Chilean DTE ecosystem (Bsale, SimpleFactura, Nubox, Defontana). Each connector maps from `DteInput` to its vendor's payload, so a tool's input schema is the same regardless of which vendor backs it.

These types live inline in `src/types-dte.ts` for now and will move to a shared `@mcify/dte-chile` package once a second connector adopts them.

## Currency and amount semantics

All amounts are **integers in CLP** (no decimals). `MntNeto`, `MntExe`, `IVA`, `MntTotal` always sum correctly. The `calculateTotales` helper applies:

- Fully-exempt types (34, 41) → all items go to `MntExe`, IVA is 0.
- Mixed: items with `exento: true` inside an afecta document go to `MntExe`.
- IVA is a flat 19% over `MntNeto` (the current Chilean rate).
- Global discounts/recargos apply to `MntNeto` if there is any, otherwise to `MntExe`.

## Storage

| Adapter                             | When to use                                                      |
| ----------------------------------- | ---------------------------------------------------------------- |
| `MemorySimpleFacturaSessionStore`   | Tests, local dev. Resets on every restart.                       |
| `JsonFileSimpleFacturaSessionStore` | Single-host deploys with a writable filesystem. Default for dev. |

For production at scale: implement the `SimpleFacturaSessionStore` interface against your real datastore (Postgres, Cloudflare D1, KV, DynamoDB) and inject it in `mcify.config.ts`. The interface is small:

```ts
interface SimpleFacturaSessionStore {
  resolveBearer(bearerToken: string): Promise<SimpleFacturaSession | null>;
  updateToken(bearerToken: string, token: SimpleFacturaTokenCache): Promise<void>;
}
```

The admin store extends with `add`, `revoke`, `addEmpresa`, `revokeEmpresa`, `setDefault`, `list`. See [`src/sessions.ts`](./src/sessions.ts).

## Security model

- **Email + password never leave the server.** Even the agent invoking a tool can't see them — handlers fetch them from the store using the validated bearer, never from the request envelope.
- **JWT cached with auto-refresh.** When a token expires (or the server returns 401), the client transparently re-authenticates and retries. The new token is persisted back to the store via `updateToken`.
- **No `RutEmisor` in tool inputs.** The agent passes a stable `userKey`; the server resolves the actual `Credenciales`. This prevents an LLM from inventing or cross-pollinating company contexts.
- **No `orgId` in tool inputs.** The server resolves the org from the bearer.
- **Bearer tokens are validated at the boundary** before any handler runs.
- **Revocation is a single CLI call.** Org-level (`revoke-org`) or per-empresa (`revoke-empresa`).

## Deploy

Multi-tenant production service — pick a target with persistent storage:

```bash
mcify deploy fly                         # default region scl, scale-to-zero
# or
mcify deploy railway                     # if you're already on Railway
# or
mcify deploy docker --push               # then helm install ./charts/mcify with a PVC
```

Cloudflare Workers / Vercel Edge are NOT recommended with the default JSON store — they don't have a writable filesystem. Pair with a DB-backed store you implement.

Per-target details: [docs.mcify.dev/deploy](https://docs.mcify.dev/deploy/overview/).

## Tests

```bash
pnpm --filter @mcify/example-simplefactura test
```

79 tests cover:

- The REST client with mocked `fetch` (auth flow, JWT cache, refresh, 401 retry, error envelope + ProblemDetails).
- `Memory` and `JsonFile` session stores (multi-empresa, default fallback, atomic writes).
- `calculateTotales` (IVA 19%, exentos, descuentos globales, edge cases).
- `buildRequestDTE` (factura, boleta, NC/ND, descuentos, referencias, mixed exento).
- Each tool's handler integration with the session store.

No SimpleFactura credentials are needed.

## Files

```
src/
├── client.ts                    # SimpleFacturaClient — JWT auth + refresh + retry
├── client.test.ts               # 10 tests
├── sessions.ts                  # SessionStore + Memory + JsonFile + resolveCredenciales
├── sessions.test.ts             # 38 tests
├── types-dte.ts                 # Vendor-agnostic DteInput/DteResult/DteItem (portable)
├── totales.ts                   # IVA + exentos + descuentos globales
├── totales.test.ts              # 12 tests
├── builders.ts                  # buildRequestDTE — DteInput → SII shape
├── builders.test.ts             # 10 tests
└── tools/                       # 13 tools, each with its handler
scripts/
├── admin.ts                     # CLI: add-org / add-empresa / set-default / revoke-* / list
└── demo-e2e.ts                  # E2E smoke test against demo@chilesystems.com
mcify.config.ts                  # bearer({ verify }) → SessionStore lookup
```

## Disclaimer

Not affiliated with or endorsed by SimpleFactura or Chilesystems. This is a community-maintained connector built on SimpleFactura's public API.

## License

Apache-2.0 (same as mcify).
