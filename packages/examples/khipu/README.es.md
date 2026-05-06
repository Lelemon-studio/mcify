# @mcify/example-khipu

Servidor MCP de referencia para [Khipu](https://khipu.com) — links de pago por transferencia bancaria en Chile — construido con [mcify](https://mcify.dev).

> **Estado:** alpha. Es el ejemplo canónico de "cómo expongo un API de pagos como servidor MCP" y se usa en Lelemon Agentes contra el sandbox de Khipu.

[Read in English](./README.md)

## Qué hace

Expone dos tools MCP que cualquier cliente compatible (Claude Desktop, Cursor, Claude Code, Lelemon Agentes, agentes propios) puede invocar:

| Tool                       | Para qué sirve                                                                 |
| -------------------------- | ------------------------------------------------------------------------------ |
| `khipu_create_payment`     | Crea un link de pago. Devuelve un `paymentUrl` que el cliente abre para pagar. |
| `khipu_get_payment_status` | Busca un pago por id. Devuelve `status`, `amount`, `subject`, etc.             |

Las dos tools están protegidas por:

- **`requireAuth`** — el agente que llama debe presentar un bearer token válido.
- **`rateLimit`** — 60 creates / 120 lookups por minuto por token.
- **`withTimeout`** — deadline de 5s; Khipu responde en < 1s la mayor parte del tiempo.

El agente que llama a este servidor usa **su propio** bearer token (`MCIFY_AUTH_TOKEN`). El API key de Khipu (`KHIPU_API_KEY`) vive en el servidor y nunca llega al agente.

## Cómo correrlo en local

```bash
# 1. Instalar deps (desde la raíz del monorepo mcify, o donde lo copiaste)
pnpm install

# 2. Conseguir un API key sandbox de Khipu
#    Registrarse en https://khipu.com/page/cuenta-cobrador-test
#    Generar key en https://khipu.com/merchant/profile/api

# 3. Configurar env vars
export KHIPU_API_KEY='tu-merchant-key'
export MCIFY_AUTH_TOKEN="$(openssl rand -hex 32)"   # token que usará tu agente

# 4. Correr con el inspector
mcify dev
```

El endpoint MCP queda en `http://localhost:8888/mcp`. Inspector en `http://localhost:3001`.

Pruébalo desde el tab **Playground** del inspector:

```json
{
  "subject": "Test Order #1",
  "currency": "CLP",
  "amount": 12990
}
```

Vas a recibir un payment URL real del sandbox de Khipu.

## Correrlo como servidor real

```bash
mcify build --target node
node dist/server.mjs
```

O deploy a Workers / Fly / Railway / Docker — ver [docs/deploy/](https://github.com/Lelemon-studio/mcify/tree/main/docs/deploy).

## Conectarlo a un agente

### Claude Desktop / Cursor

En la config MCP de tu cliente:

```jsonc
{
  "mcpServers": {
    "khipu": {
      "url": "https://tu-deploy.example.com/mcp",
      "headers": {
        "authorization": "Bearer TU_MCIFY_AUTH_TOKEN",
      },
    },
  },
}
```

### Lelemon Agentes

Registrar la URL + token en `organization_mcp_servers`. Sofia (la agente de WhatsApp) recibe las tools `khipu_*` y puede crear links de pago desde el chat.

## Arquitectura (para contributors)

```
src/
├── client.ts              KhipuClient — wrapper fetch fino, mapeo snake_case ↔ camelCase, KhipuApiError.
├── tools/
│   ├── create-payment.ts  defineTool(...) para khipu_create_payment.
│   └── get-payment-status.ts
└── index.ts               Re-exports para uso programático.

mcify.config.ts            defineConfig — conecta el cliente + las tools, declara auth server-side.
```

El handler es **una línea**: `async (input) => client.createPayment(input)`. Validación de schema, auth, rate limit, timeouts — todo eso vive en el middleware o en el borde del sistema. El handler queda puro.

Este es el patrón que recomendamos para cualquier connector mcify que construyas.

## Tests

```bash
pnpm --filter @mcify/example-khipu test
```

La suite cubre:

- Tests unitarios del cliente con `fetch` mockeado — verifica headers, forma del body, mapeo de errores.
- Tests de integración vía `createTestClient` de `@mcify/runtime/test` — mismo dispatch que producción.

No se necesitan credenciales sandbox de Khipu para correr los tests; todo está mockeado.

## Licencia

Apache 2.0. Usalo como punto de partida para tu propio servidor MCP (`mcify init --template example-khipu` cuando llegue ese template en Phase C.4).
