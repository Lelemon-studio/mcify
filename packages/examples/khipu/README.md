# @mcify/example-khipu

Multi-tenant MCP server for [Khipu](https://khipu.com) — Chilean bank-transfer payment links — built with [mcify](https://mcify.dev).

> **Status:** alpha. Production shape: one deploy serves many merchants, each with their own Khipu API key and `dev` or `live` environment. The agent never holds the API key — only the bearer token issued at onboarding.

[Leer en español](./README.es.md)

## What it does

Exposes 6 MCP tools that any compatible client (Claude Desktop, Cursor, Claude Code, Lelemon Agents, custom agents) can invoke against any Khipu merchant connected to the server.

| Tool                         | What it does                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| `khipu_create_payment_link`  | Create a payment link the merchant shares with the customer (typical PyME-WhatsApp case). |
| `khipu_get_payment_status`   | Look up a payment by id; returns the portable status (paid, pending, failed, ...).        |
| `khipu_cancel_payment`       | Cancel a pending payment link before the customer pays.                                   |
| `khipu_refund_payment`       | Refund a paid payment (full or partial).                                                  |
| `khipu_list_banks`           | List the Chilean banks Khipu can route through for this merchant.                         |
| `khipu_list_payment_methods` | List the payment methods enabled on the merchant's account.                               |

Every tool is protected by:

- **`requireAuth`** — the calling agent must present a valid bearer token registered in the session store.
- **`rateLimit`** — create 30/min, refund 10/min (sensitive), reads 60–120/min per token.
- **`withTimeout`** — 5–8s deadlines.

## The PyME-WhatsApp case

The motivating use case for this connector: a small Chilean merchant (taller, dental, restaurant, e-commerce) operates Khipu via WhatsApp through Lelemon Agents.

> _Owner:_ "Generale link de pago a Acme por $50.000."
>
> _Agent:_ `khipu_create_payment_link({ subject: "Cobro Acme", amount: 50000, currency: "CLP", customer: { rut: "11.111.111-1" } })`
>
> _Agent:_ "Listo, este es el link: `https://khipu.com/payment/...`. Le mando un mensaje al cliente."

This pattern beats logging into the Khipu dashboard for every charge — the killer feature for PyME ergonomics on chat.

## Architecture (multi-tenant)

```
       Khipu merchant A        Khipu merchant B        Khipu merchant C
       ──────────────────      ──────────────────      ──────────────────
       apiKey A (live)         apiKey B (dev)          apiKey C (live)
              │                          │                          │
              └──────────────┬───────────┴──────────────┬──────────┘
                             ▼                          ▼
             ┌─────────────────────────────────────────┐
             │          ONE mcify deploy               │
             │   ┌───────────────────────────────────┐ │
             │   │  KhipuSessionStore                │ │
             │   │  bearer_X → {                     │ │
             │   │    orgId: "merchant-A",           │ │
             │   │    apiKey: kp_live_...,           │ │
             │   │    environment: "live"            │ │
             │   │  }                                │ │
             │   │  bearer_Y → { ..., env: "dev" }   │ │
             │   └───────────────────────────────────┘ │
             └────────────┬────────────────────────────┘
                          │
           ┌──────────────┼──────────────┐
           ▼              ▼              ▼
    Claude Desktop  Lelemon Agents  Custom agent
    Bearer = X      Bearer = Y      Bearer = Z
```

## dev vs live

Khipu issues separate API keys for development accounts (no real money moves) and live accounts (real bank transfers). The connector models this on the session — each org declares which environment it operates against, so dev and live merchants co-exist on the same deploy without risk of cross-mixing.

| Environment | When to use                                                    |
| ----------- | -------------------------------------------------------------- |
| `dev`       | Testing the integration. Use Khipu's free development account. |
| `live`      | Real customers, real money. Use a production API key.          |

The base URL is the same for both (`https://payment-api.khipu.com/v3`); only the API key changes.

## Run locally

```bash
# 1. Install deps from the mcify monorepo root
pnpm install

# 2. Onboard your first merchant. The CLI generates a bearer if you don't pass one.
pnpm --filter @mcify/example-khipu admin add-org \
  lelemon kp_test_xxxxxxxx dev

# 3. (Optional) onboard a live merchant:
pnpm --filter @mcify/example-khipu admin add-org \
  acme kp_live_xxxxxxxx live

# 4. Run the dev server
pnpm --filter @mcify/example-khipu dev
```

The session store lives at `./sessions.json` (override with `KHIPU_SESSIONS_PATH`). For production at scale, swap `JsonFileKhipuSessionStore` for a database-backed implementation.

The MCP endpoint is `http://localhost:8888/mcp`. The inspector lives at `http://localhost:3001`.

## Onboarding flow (what the operator does)

1. New merchant signs up at [khipu.com](https://khipu.com) and creates a collection account.
2. Merchant copies their API key from the dashboard.
3. Operator receives the API key over a secure channel (never email).
4. Operator runs:

   ```bash
   pnpm admin add-org <orgId> <apiKey> [environment=dev|live] [bearer-or-omit-to-generate]
   ```

5. Operator hands the bearer to the merchant; they paste it in their Claude Desktop / Cursor config.

To revoke:

```bash
pnpm admin revoke-org <bearer>
```

To list:

```bash
pnpm admin list
```

## How the merchant connects (Claude Desktop)

```json
{
  "mcpServers": {
    "khipu": {
      "url": "https://khipu-mcp.your-host.com/mcp",
      "headers": {
        "authorization": "Bearer THE_BEARER_THE_OPERATOR_PROVISIONED"
      }
    }
  }
}
```

Restart Claude Desktop and the tools appear. The merchant can now ask things like _"Generale link de pago a Acme por $50.000."_

## Webhook verification

Khipu calls the merchant's `notify_url` (set on `khipu_create_payment_link`) when a payment confirms. The connector exports two helpers for the merchant's webhook handler:

```ts
import { parseKhipuNotification, verifyKhipuWebhookSignature } from '@mcify/example-khipu';

// In your Express / Hono / Fastify handler:
app.post('/khipu-webhook', async (req, res) => {
  const rawBody = await readRawBody(req); // do NOT JSON.parse first

  // Recommended (v3): re-fetch the payment to verify authenticity.
  const notification = parseKhipuNotification(rawBody);
  if (!notification) return res.status(400).end();
  const payment = await khipuClient.getPayment(notification.notificationToken);
  // If getPayment returns the payment, the notification is real.

  // Legacy (v1.3): verify HMAC signature on the raw body.
  const ok = verifyKhipuWebhookSignature(
    rawBody,
    req.headers['x-khipu-signature'] as string,
    process.env.KHIPU_WEBHOOK_SECRET!,
  );
  if (!ok) return res.status(401).end();

  // ...handle the payment.
});
```

## Vendor-agnostic types

The input/output types (`PaymentLinkInput`, `PaymentLinkResult`, `PaymentLinkStatus`, etc.) are designed to be **portable** across the Chilean payment-link ecosystem (Khipu, Mercado Pago, Webpay, Smart Checkout / Fintoc). Each connector maps from `PaymentLinkInput` to its native payload, so a tool's input schema is the same regardless of which vendor backs it.

These types live inline in `src/types-payment.ts` for now and will move to a shared `@mcify/payments-chile` package once a second connector adopts them.

The portable status enum collapses Khipu's six native states (`pending`, `verifying`, `done`, `committed`, `failed`, `rejected`) into the canonical six (`pending`, `paid`, `expired`, `cancelled`, `failed`, `refunded`). The `mapKhipuStatus` helper documents the mapping.

## Storage

| Adapter                     | When to use                                                      |
| --------------------------- | ---------------------------------------------------------------- |
| `MemoryKhipuSessionStore`   | Tests, local dev. Resets on every restart.                       |
| `JsonFileKhipuSessionStore` | Single-host deploys with a writable filesystem. Default for dev. |

For production at scale: implement the `KhipuSessionStore` interface against your real datastore (Postgres, Cloudflare D1, KV, DynamoDB) and inject it in `mcify.config.ts`.

```ts
interface KhipuSessionStore {
  resolveBearer(bearerToken: string): Promise<KhipuSession | null>;
}
```

The admin store extends with `add`, `revoke`, `list`. See [`src/sessions.ts`](./src/sessions.ts).

## Security model

- **API keys never leave the server.** Even the agent invoking a tool can't see them — handlers fetch them from the store using the validated bearer, never from the request envelope.
- **No `apiKey` or `environment` in tool inputs.** The agent only ever sees the bearer; the server resolves the rest.
- **Bearer tokens are validated at the boundary** before any handler runs. Unknown / revoked tokens get a 401.
- **Refunds are rate-limited 10/min** because they're sensitive operations.
- **Webhook signature verification helper** is exported so the merchant can verify incoming notifications without trusting the network.

## Deploy

Multi-tenant production service — pick a target with persistent storage:

```bash
mcify deploy fly                         # default region scl, scale-to-zero
# or
mcify deploy railway
# or
mcify deploy docker --push
```

Cloudflare Workers / Vercel Edge are NOT recommended with the default JSON store — they don't have a writable filesystem. Pair with a DB-backed store you implement.

Per-target details: [docs.mcify.dev/deploy](https://docs.mcify.dev/deploy/overview/).

## Tests

```bash
pnpm --filter @mcify/example-khipu test
```

Tests cover:

- The REST client with mocked `fetch` (auth header, snake_case body, status mapping, error envelopes).
- `Memory` and `JsonFile` session stores (multi-tenant, dev/live, atomic writes).
- `mapKhipuStatus` (Khipu native → portable mapping).
- `verifyKhipuWebhookSignature` (HMAC + tolerance window + tampered body + bad secret).
- `parseKhipuNotification` (form-urlencoded body parsing).

No Khipu credentials are needed.

## Files

```
src/
├── client.ts                    # KhipuClient — payments, refunds, banks, payment methods
├── client.test.ts               # client tests with mocks
├── sessions.ts                  # SessionStore + Memory + JsonFile + sessionFromContext
├── sessions.test.ts             # session store tests
├── types-payment.ts             # Vendor-agnostic PaymentLinkInput/Result/Status (portable)
├── webhook.ts                   # verifyKhipuWebhookSignature + parseKhipuNotification
├── webhook.test.ts              # webhook helper tests
└── tools/
    ├── create-payment-link.ts
    ├── get-payment-status.ts
    ├── cancel-payment.ts
    ├── refund-payment.ts
    ├── list-banks.ts
    └── list-payment-methods.ts
scripts/
└── admin.ts                     # CLI: add-org / revoke-org / list
mcify.config.ts                  # bearer({ verify }) → SessionStore lookup
```

## Disclaimer

Not affiliated with or endorsed by Khipu. This is a community-maintained connector built on Khipu's public API.

## License

Apache-2.0 (same as mcify).
