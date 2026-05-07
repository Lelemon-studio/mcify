# @mcify/example-mercadopago

Multi-tenant MCP server for [Mercado Pago](https://www.mercadopago.cl) — Chile's most adopted payment platform — built with [mcify](https://mcify.dev).

> **Status:** alpha. Production shape: one deploy serves many merchants, each with their own MP access token and sandbox/production environment.

[Leer en español](./README.es.md)

## What it does

Exposes 4 MCP tools that any compatible client (Claude Desktop, Cursor, Lelemon Agents, custom agents) can invoke against any MP merchant connected to the server.

| Tool                               | What it does                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| `mercadopago_create_payment_link`  | Create a payment link to share with a customer (cards, transfers, MP wallet, ticket). |
| `mercadopago_get_payment_status`   | Look up the status (paid, pending, failed, ...) of a payment link.                    |
| `mercadopago_refund_payment`       | Refund a paid payment (full or partial).                                              |
| `mercadopago_list_payment_methods` | List the payment methods enabled on the merchant's account.                           |

## The PyME-WhatsApp case

Same use case as Khipu — small Chilean merchants operate MP via WhatsApp through Lelemon Agents:

> _Owner:_ "Generale link de pago a Acme por $50.000."
>
> _Agent:_ `mercadopago_create_payment_link({ subject: "Cobro Acme", amount: 50000, currency: "CLP" })`
>
> _Agent:_ "Listo, este es el link: `https://www.mercadopago.cl/checkout/v1/redirect?pref_id=...`. Le mando un mensaje al cliente."

MP gives the customer more options than Khipu (cards + transfers + MP wallet + ticket / efectivo) — useful when the merchant wants to maximise conversion at the cost of higher fees.

## The MP duality: Preference vs Payment

MP separates the **Preference** (the payment link) from the **Payment** (the actual transaction):

```
Merchant ─→ create Preference ─→ get init_point URL
Customer ─→ open URL ─→ pay (cards/transfer/wallet)
MP       ─→ create Payment associated with the Preference
MP       ─→ POST notify_url → merchant receives notification
Merchant ─→ refund acts on the Payment, not the Preference
```

The connector hides this duality from the agent: tools accept and return a single id (the **preference id**, the link id), and the client resolves the underlying payment internally for status lookup and refunds.

This means:

- `mercadopago_create_payment_link` returns the preference id as `paymentId`.
- `mercadopago_get_payment_status` accepts the preference id and reports the latest associated payment's status.
- `mercadopago_refund_payment` accepts either a preference id or an MP payment id (numeric) — the connector handles both.

## sandbox vs production

MP issues separate access tokens for sandbox and production. Token prefixes:

- `TEST-...` → sandbox. No real money.
- `APP_USR-...` → production. Real money.

The session declares which one this org uses; when sandbox, the connector returns `sandbox_init_point` as the primary URL.

## Run locally

```bash
pnpm install

# Sandbox merchant:
pnpm --filter @mcify/example-mercadopago admin add-org \
  lelemon TEST-xxxxxxxx sandbox

# Production merchant:
pnpm --filter @mcify/example-mercadopago admin add-org \
  acme APP_USR-xxxxxxxx production

pnpm --filter @mcify/example-mercadopago dev
```

The session store lives at `./sessions.json` (override with `MERCADOPAGO_SESSIONS_PATH`).

## Onboarding flow

1. Merchant creates an integration at https://www.mercadopago.cl/developers → "Tus integraciones".
2. Merchant copies their access token from the dashboard.
3. Operator runs:
   ```bash
   pnpm admin add-org <orgId> <accessToken> [environment=sandbox|production] [bearer-or-omit]
   ```
4. Operator hands the bearer to the merchant for their Claude Desktop / Cursor config.

## How the merchant connects

```json
{
  "mcpServers": {
    "mercadopago": {
      "url": "https://mercadopago-mcp.your-host.com/mcp",
      "headers": { "authorization": "Bearer THE_BEARER" }
    }
  }
}
```

## Webhook verification

MP signs notifications with HMAC-SHA256 of a templated string built from `data.id`, `request-id`, and the timestamp:

```
template = `id:${dataId};request-id:${requestId};ts:${ts};`
signature = HMAC_SHA256(template, webhook_secret)
```

The connector exports a helper:

```ts
import { verifyMercadoPagoWebhookSignature } from '@mcify/example-mercadopago';

app.post('/mp-webhook', async (req, res) => {
  const dataId = String(req.query['data.id'] ?? req.body.data?.id);
  const ok = verifyMercadoPagoWebhookSignature({
    dataId,
    requestId: String(req.headers['x-request-id']),
    signatureHeader: String(req.headers['x-signature']),
    secret: process.env.MP_WEBHOOK_SECRET!,
  });
  if (!ok) return res.status(401).end();
  // ...handle the notification
});
```

## Vendor-agnostic types

`PaymentLinkInput`, `PaymentLinkResult`, `PaymentLinkStatus`, `PaymentMethodItem`, `RefundInput`, `RefundResult` — same shape as the Khipu connector. **Second adopter** of these types in the ecosystem.

This is the moment to extract them to a shared `@mcify/payments-chile` package — the shape is now validated against two distinct vendor APIs (Khipu's bank-transfer-first model and MP's card-first model) and survives both.

The portable status enum collapses MP's nine native states (`pending`, `approved`, `authorized`, `in_process`, `in_mediation`, `rejected`, `cancelled`, `refunded`, `charged_back`) into the canonical six (`pending`, `paid`, `expired`, `cancelled`, `failed`, `refunded`). The `mapMercadoPagoStatus` helper documents the mapping.

## Security model

- **Access tokens never leave the server.** Resolved from the bearer at request time.
- **No `accessToken` or `environment` in tool inputs.**
- **Refunds rate-limited 10/min** because they're sensitive operations.
- **Webhook signature helper** exported so merchants can verify incoming notifications.

## Tests

```bash
pnpm --filter @mcify/example-mercadopago test
```

41 tests cover client (Bearer auth, preference create + items mapping, status enrichment via payment search, refund resolution from preference id, error parsing), session store, status mapping (9 native → 6 portable), webhook signature verification (template + tamper detection + tolerance window).

## Files

```
src/
├── client.ts                    # MercadoPagoClient — preferences + payments + refunds
├── client.test.ts
├── sessions.ts                  # SessionStore + Memory + JsonFile + sandbox/production
├── sessions.test.ts
├── types-payment.ts             # Portable PaymentLink* types (second adopter, ready to extract)
├── webhook.ts                   # verifyMercadoPagoWebhookSignature
├── webhook.test.ts
└── tools/
    ├── create-payment-link.ts
    ├── get-payment-status.ts
    ├── refund-payment.ts
    └── list-payment-methods.ts
scripts/
└── admin.ts                     # CLI: add-org / revoke-org / list
mcify.config.ts                  # bearer({ verify }) → SessionStore lookup
```

## Disclaimer

Not affiliated with or endorsed by Mercado Pago. Community connector built on MP's public API.

## License

Apache-2.0 (same as mcify).
