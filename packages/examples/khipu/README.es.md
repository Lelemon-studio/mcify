# @mcify/example-khipu

Servidor MCP **multi-tenant** para [Khipu](https://khipu.com) — links de pago por transferencia bancaria en Chile — construido con [mcify](https://mcify.dev).

> **Estado:** alpha. Forma de producción: **un único deploy** sirve a muchos comercios, cada uno con su propio API key Khipu y entorno `dev` o `live`. El agente nunca ve la credencial — solo el bearer token emitido en el onboarding.

[Read in English](./README.md)

## Qué hace

Expone 6 tools MCP que cualquier cliente compatible (Claude Desktop, Cursor, Claude Code, Lelemon Agents, agentes propios) puede invocar.

| Tool                         | Para qué sirve                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `khipu_create_payment_link`  | Crea un link de pago que el comercio comparte con el cliente (caso típico: PyME por WhatsApp). |
| `khipu_get_payment_status`   | Consulta el estado de un pago. Devuelve estado portable (paid, pending, failed, ...).          |
| `khipu_cancel_payment`       | Cancela un pago pendiente antes de que el cliente pague.                                       |
| `khipu_refund_payment`       | Reembolsa un pago realizado (full o parcial).                                                  |
| `khipu_list_banks`           | Lista los bancos chilenos que Khipu soporta para este comercio.                                |
| `khipu_list_payment_methods` | Lista los métodos de pago activos en la cuenta del comercio.                                   |

Cada tool está protegida por:

- **`requireAuth`** — el agente debe presentar un bearer token válido.
- **`rateLimit`** — create 30/min, refund 10/min (sensible), lecturas 60–120/min por token.
- **`withTimeout`** — 5–8s.

## El caso PyME-WhatsApp

El caso de uso motivador del connector: un comercio chileno chico (taller, dental, restaurant, e-commerce) opera Khipu desde WhatsApp via Lelemon Agents.

> _Dueño:_ "Generale link de pago a Acme por $50.000."
>
> _Agente:_ `khipu_create_payment_link({ subject: "Cobro Acme", amount: 50000, currency: "CLP", customer: { rut: "11.111.111-1" } })`
>
> _Agente:_ "Listo, este es el link: `https://khipu.com/payment/...`. Le mando un mensaje al cliente."

Esto le gana al portal Khipu para cobrar — la feature killer para ergonomía PyME en chat.

## Arquitectura (multi-tenant)

```
       Comercio Khipu A         Comercio Khipu B         Comercio Khipu C
       ──────────────────       ──────────────────       ──────────────────
       apiKey A (live)          apiKey B (dev)           apiKey C (live)
              │                          │                          │
              └──────────────┬───────────┴──────────────┬──────────┘
                             ▼                          ▼
             ┌─────────────────────────────────────────┐
             │          UN deploy de mcify             │
             │   ┌───────────────────────────────────┐ │
             │   │  KhipuSessionStore                │ │
             │   │  bearer_X → {                     │ │
             │   │    orgId: "comercio-A",           │ │
             │   │    apiKey: kp_live_...,           │ │
             │   │    environment: "live"            │ │
             │   │  }                                │ │
             │   │  bearer_Y → { ..., env: "dev" }   │ │
             │   └───────────────────────────────────┘ │
             └────────────┬────────────────────────────┘
                          │
           ┌──────────────┼──────────────┐
           ▼              ▼              ▼
    Claude Desktop  Lelemon Agents  Agente propio
    Bearer = X      Bearer = Y      Bearer = Z
```

## dev vs live

Khipu emite credenciales separadas para cuentas de desarrollo (sin movimientos reales) y producción (transferencias bancarias reales). El connector lo modela en la session — cada org declara contra qué entorno opera, así dev y live conviven en el mismo deploy sin riesgo de cruce.

| Entorno | Cuándo usarlo                                                |
| ------- | ------------------------------------------------------------ |
| `dev`   | Probar la integración. Cuenta de desarrollo gratis de Khipu. |
| `live`  | Clientes reales, plata real. API key de producción.          |

La base URL es la misma para ambos (`https://payment-api.khipu.com/v3`); solo cambia la API key.

## Correrlo en local

```bash
# 1. Instalar deps desde la raíz del monorepo mcify
pnpm install

# 2. Onboardear el primer comercio. El CLI genera un bearer si no pasás uno.
pnpm --filter @mcify/example-khipu admin add-org \
  lelemon kp_test_xxxxxxxx dev

# 3. (Opcional) onboardear un comercio en producción:
pnpm --filter @mcify/example-khipu admin add-org \
  acme kp_live_xxxxxxxx live

# 4. Levantar el dev server
pnpm --filter @mcify/example-khipu dev
```

El session store vive en `./sessions.json` (override con `KHIPU_SESSIONS_PATH`). Para producción a escala, reemplazá `JsonFileKhipuSessionStore` por una implementación contra DB.

Endpoint MCP: `http://localhost:8888/mcp`. Inspector: `http://localhost:3001`.

## Flujo de onboarding (lo que hace el operador)

1. Comercio nuevo se registra en [khipu.com](https://khipu.com) y crea cuenta de cobro.
2. Comercio copia su API key del dashboard.
3. Operador recibe el API key por canal seguro (nunca email).
4. Operador corre:

   ```bash
   pnpm admin add-org <orgId> <apiKey> [environment=dev|live] [bearer-o-omitir-para-generar]
   ```

5. Operador entrega el bearer al comercio; lo pega en su Claude Desktop / Cursor.

Para revocar:

```bash
pnpm admin revoke-org <bearer>
```

Para listar:

```bash
pnpm admin list
```

## Cómo se conecta el comercio (Claude Desktop)

```json
{
  "mcpServers": {
    "khipu": {
      "url": "https://khipu-mcp.tu-host.com/mcp",
      "headers": {
        "authorization": "Bearer EL_BEARER_QUE_APROVISIONÓ_EL_OPERADOR"
      }
    }
  }
}
```

Reinicia Claude Desktop y las tools aparecen. El comercio puede pedir cosas como _"Generale link de pago a Acme por $50.000."_

## Verificación de webhook

Khipu llama al `notify_url` del comercio (seteado en `khipu_create_payment_link`) cuando un pago se confirma. El connector exporta dos helpers para el handler de webhook del comercio:

```ts
import { parseKhipuNotification, verifyKhipuWebhookSignature } from '@mcify/example-khipu';

// En tu handler de Express / Hono / Fastify:
app.post('/khipu-webhook', async (req, res) => {
  const rawBody = await readRawBody(req); // NO hagas JSON.parse antes

  // Recomendado (v3): re-fetch del payment para verificar autenticidad.
  const notification = parseKhipuNotification(rawBody);
  if (!notification) return res.status(400).end();
  const payment = await khipuClient.getPayment(notification.notificationToken);
  // Si getPayment devuelve el pago, la notificación es real.

  // Legacy (v1.3): verifica HMAC sobre el body crudo.
  const ok = verifyKhipuWebhookSignature(
    rawBody,
    req.headers['x-khipu-signature'] as string,
    process.env.KHIPU_WEBHOOK_SECRET!,
  );
  if (!ok) return res.status(401).end();

  // ...procesar el pago.
});
```

## Tipos agnósticos al vendor

Los tipos de input/output (`PaymentLinkInput`, `PaymentLinkResult`, `PaymentLinkStatus`, etc.) están diseñados para ser **portables** entre vendors de payment-links chilenos (Khipu, Mercado Pago, Webpay, Smart Checkout / Fintoc). Cada connector mapea desde `PaymentLinkInput` al payload nativo del vendor.

Los tipos viven inline en `src/types-payment.ts`; se mueven a `@mcify/payments-chile` cuando un segundo connector los adopte.

El enum portable de status colapsa los seis estados nativos de Khipu (`pending`, `verifying`, `done`, `committed`, `failed`, `rejected`) en los seis canónicos (`pending`, `paid`, `expired`, `cancelled`, `failed`, `refunded`). El helper `mapKhipuStatus` documenta el mapeo.

## Almacenamiento

| Adapter                     | Cuándo usarlo                                            |
| --------------------------- | -------------------------------------------------------- |
| `MemoryKhipuSessionStore`   | Tests, dev local. Se borra en cada reinicio.             |
| `JsonFileKhipuSessionStore` | Single-host con filesystem escribible. Default para dev. |

Para producción a escala: implementás `KhipuSessionStore` contra tu DB:

```ts
interface KhipuSessionStore {
  resolveBearer(bearerToken: string): Promise<KhipuSession | null>;
}
```

El admin store extiende con `add`, `revoke`, `list`. Ver [`src/sessions.ts`](./src/sessions.ts).

## Modelo de seguridad

- **API keys nunca salen del servidor.** Ni el agente que invoca una tool puede verlas — los handlers las buscan en el store usando el bearer validado.
- **Sin `apiKey` ni `environment` en los inputs.** El agente solo ve el bearer; el servidor resuelve el resto.
- **Bearer se valida en el borde** antes de cualquier handler.
- **Refunds rate-limited 10/min** porque son operaciones sensibles.
- **Helper de verificación de webhook** exportado para que el comercio verifique notificaciones sin confiar en la red.

## Deploy

Servicio multi-tenant productivo — necesita target con storage persistente:

```bash
mcify deploy fly                         # región scl default, scale-to-zero
# o
mcify deploy railway
# o
mcify deploy docker --push
```

Cloudflare Workers / Vercel Edge NO recomendados con el JSON store por default — sin filesystem escribible. Pareá con un store contra DB.

Detalle por target: [docs.mcify.dev/deploy](https://docs.mcify.dev/deploy/overview/).

## Tests

```bash
pnpm --filter @mcify/example-khipu test
```

Tests cubren:

- Cliente REST con `fetch` mockeado (auth header, body snake_case, status mapping, errores).
- Stores `Memory` y `JsonFile` (multi-tenant, dev/live, writes atómicos).
- `mapKhipuStatus` (Khipu nativo → portable).
- `verifyKhipuWebhookSignature` (HMAC + ventana de tolerancia + body alterado + secret malo).
- `parseKhipuNotification` (parsing de form-urlencoded).

No requieren credenciales reales.

## Archivos

```
src/
├── client.ts                    # KhipuClient — payments, refunds, banks, payment methods
├── client.test.ts               # tests del cliente con mocks
├── sessions.ts                  # SessionStore + Memory + JsonFile + sessionFromContext
├── sessions.test.ts             # tests del session store
├── types-payment.ts             # Tipos agnósticos PaymentLinkInput/Result/Status (portables)
├── webhook.ts                   # verifyKhipuWebhookSignature + parseKhipuNotification
├── webhook.test.ts              # tests del helper de webhook
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

No afiliado a Khipu. Connector comunitario sobre la API pública de Khipu.

## Licencia

Apache-2.0 (igual que mcify).
