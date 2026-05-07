# @mcify/example-mercadopago

Servidor MCP **multi-tenant** para [Mercado Pago](https://www.mercadopago.cl) — la pasarela de pagos más adoptada en Chile — construido con [mcify](https://mcify.dev).

> **Estado:** alpha. Forma de producción: un único deploy sirve a muchos comercios, cada uno con su propio access token MP y entorno sandbox/production.

[Read in English](./README.md)

## Qué hace

Expone 4 tools MCP que cualquier cliente compatible (Claude Desktop, Cursor, Lelemon Agents, agentes propios) puede invocar.

| Tool                               | Para qué sirve                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `mercadopago_create_payment_link`  | Crea un link de pago para compartir con el cliente (tarjetas, transferencias, billetera MP, ticket). |
| `mercadopago_get_payment_status`   | Consulta el estado (paid, pending, failed, ...) de un link de pago.                                  |
| `mercadopago_refund_payment`       | Reembolsa un pago realizado (full o parcial).                                                        |
| `mercadopago_list_payment_methods` | Lista los métodos de pago activos en la cuenta del comercio.                                         |

## El caso PyME-WhatsApp

Mismo caso que Khipu — comercios chilenos chicos operan MP desde WhatsApp via Lelemon Agents:

> _Dueño:_ "Generale link de pago a Acme por $50.000."
>
> _Agente:_ `mercadopago_create_payment_link({ subject: "Cobro Acme", amount: 50000, currency: "CLP" })`
>
> _Agente:_ "Listo, este es el link: `https://www.mercadopago.cl/checkout/v1/redirect?pref_id=...`. Le mando un mensaje al cliente."

MP le da al cliente más opciones que Khipu (tarjetas + transferencia + billetera + ticket en efectivo) — útil cuando el comercio quiere maximizar conversión a costa de fees más altos.

## La dualidad MP: Preference vs Payment

MP separa la **Preference** (el link de pago) del **Payment** (la transacción real):

```
Comercio ─→ crea Preference ─→ recibe URL init_point
Cliente  ─→ abre URL ─→ paga (tarjetas/transferencia/billetera)
MP       ─→ crea Payment asociado a la Preference
MP       ─→ POST notify_url → comercio recibe notificación
Comercio ─→ refund opera sobre el Payment, no la Preference
```

El connector oculta esta dualidad al agente: los tools aceptan y devuelven un solo id (la **preference id**, el id del link), y el cliente resuelve el payment subyacente internamente para consultas de estado y refunds.

Esto significa:

- `mercadopago_create_payment_link` devuelve la preference id como `paymentId`.
- `mercadopago_get_payment_status` acepta la preference id y reporta el estado del payment más reciente asociado.
- `mercadopago_refund_payment` acepta tanto la preference id como un MP payment id (numérico) — el connector maneja ambos.

## sandbox vs production

MP emite access tokens separados para sandbox y producción. Prefijos:

- `TEST-...` → sandbox. Sin movimientos reales.
- `APP_USR-...` → production. Plata real.

La session declara cuál usa; en sandbox, el connector devuelve `sandbox_init_point` como URL primaria.

## Correrlo en local

```bash
pnpm install

# Comercio sandbox:
pnpm --filter @mcify/example-mercadopago admin add-org \
  lelemon TEST-xxxxxxxx sandbox

# Comercio producción:
pnpm --filter @mcify/example-mercadopago admin add-org \
  acme APP_USR-xxxxxxxx production

pnpm --filter @mcify/example-mercadopago dev
```

El session store vive en `./sessions.json` (override con `MERCADOPAGO_SESSIONS_PATH`).

## Flujo de onboarding

1. Comercio crea una integración en https://www.mercadopago.cl/developers → "Tus integraciones".
2. Comercio copia su access token del dashboard.
3. Operador corre:
   ```bash
   pnpm admin add-org <orgId> <accessToken> [environment=sandbox|production] [bearer-o-omitir]
   ```
4. Operador entrega el bearer al comercio para su Claude Desktop / Cursor.

## Cómo se conecta el comercio

```json
{
  "mcpServers": {
    "mercadopago": {
      "url": "https://mercadopago-mcp.tu-host.com/mcp",
      "headers": { "authorization": "Bearer EL_BEARER" }
    }
  }
}
```

## Verificación de webhook

MP firma las notificaciones con HMAC-SHA256 sobre un template que incluye `data.id`, `request-id` y el timestamp:

```
template = `id:${dataId};request-id:${requestId};ts:${ts};`
signature = HMAC_SHA256(template, webhook_secret)
```

El connector exporta un helper:

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
  // ...procesar la notificación
});
```

## Tipos agnósticos al vendor

`PaymentLinkInput`, `PaymentLinkResult`, `PaymentLinkStatus`, `PaymentMethodItem`, `RefundInput`, `RefundResult` — mismo shape que el connector Khipu. **Segundo adoptante** de estos tipos en el ecosistema.

Este es el momento para extraerlos al paquete compartido `@mcify/payments-chile` — el shape ahora está validado contra dos APIs distintas (modelo bank-transfer-first de Khipu y card-first de MP) y sobrevive ambas.

El enum portable de status colapsa los nueve estados nativos de MP (`pending`, `approved`, `authorized`, `in_process`, `in_mediation`, `rejected`, `cancelled`, `refunded`, `charged_back`) en los seis canónicos (`pending`, `paid`, `expired`, `cancelled`, `failed`, `refunded`). El helper `mapMercadoPagoStatus` documenta el mapeo.

## Modelo de seguridad

- **Access tokens nunca salen del servidor.** Se resuelven del bearer en cada request.
- **Sin `accessToken` ni `environment` en los inputs.**
- **Refunds rate-limited 10/min** porque son operaciones sensibles.
- **Helper de verificación de webhook** exportado para que comercios verifiquen notificaciones.

## Tests

```bash
pnpm --filter @mcify/example-mercadopago test
```

41 tests cubren cliente (Bearer auth, creación de preference + mapeo de items, enriquecimiento de status via payment search, resolución de refund desde preference id, parsing de errores), session store, status mapping (9 nativo → 6 portable), verificación de webhook (template + tamper detection + tolerance window).

## Archivos

```
src/
├── client.ts                    # MercadoPagoClient — preferences + payments + refunds
├── client.test.ts
├── sessions.ts                  # SessionStore + Memory + JsonFile + sandbox/production
├── sessions.test.ts
├── types-payment.ts             # Tipos portables PaymentLink* (segundo adoptante, listo para extraer)
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

No afiliado a Mercado Pago. Connector comunitario sobre el API público de MP.

## Licencia

Apache-2.0 (igual que mcify).
