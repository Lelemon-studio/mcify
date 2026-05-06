# @mcify/example-bsale

Servidor MCP de referencia para [Bsale](https://www.bsale.io) — DTE / facturación electrónica chilena — construido con [mcify](https://mcify.dev).

> **Estado:** alpha. Ejemplo canónico de "cómo expongo un API de facturación como MCP."

[Read in English](./README.md)

## Qué hace

Expone cuatro tools MCP que cualquier cliente compatible (Claude Desktop, Cursor, Claude Code, Lelemon Agentes, agentes propios) puede invocar:

| Tool                  | Para qué sirve                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| `bsale_emit_dte`      | Emite un DTE (factura/boleta) y devuelve número, total y URLs del PDF/XML.                                |
| `bsale_list_invoices` | Lista documentos emitidos. Filtra por rango de fecha y tipo de documento.                                 |
| `bsale_get_invoice`   | Busca un documento por id. Devuelve la misma forma que `bsale_emit_dte`.                                  |
| `bsale_list_clients`  | Encuentra clientes por RUT o email — el connector elige el campo Bsale correcto según la forma del query. |

Cada tool está protegida por:

- **`requireAuth`** — el agente que llama debe presentar un bearer token válido.
- **`rateLimit`** — emit 30/min, lecturas 120–240/min por token (más bajo para emit porque los DTE tienen peso legal).
- **`withTimeout`** — deadlines de 5–15s.

El agente que llama a este servidor usa **su propio** bearer token (`MCIFY_AUTH_TOKEN`). El access token de Bsale (`BSALE_ACCESS_TOKEN`) vive en el servidor y nunca llega al agente.

## Cómo correrlo en local

```bash
# 1. Instalar deps (desde la raíz del monorepo mcify)
pnpm install

# 2. Conseguir un access token de Bsale
#    Iniciar sesión en https://app.bsale.io
#    Configuración → API → "Crear Token"

# 3. Configurar env vars
export BSALE_ACCESS_TOKEN='tu-token-bsale'
export MCIFY_AUTH_TOKEN="$(openssl rand -hex 32)"   # token que usará tu agente

# 4. Correr con el inspector
mcify dev
```

El endpoint MCP queda en `http://localhost:8888/mcp`. La UI del inspector vive en `http://localhost:3001`.

## Conectar desde Claude Desktop

Editar `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) o `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "bsale": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-fetch"],
      "env": {
        "MCP_URL": "http://localhost:8888/mcp",
        "MCP_AUTH": "Bearer TU_MCIFY_AUTH_TOKEN"
      }
    }
  }
}
```

Reiniciar Claude Desktop. Pedir: "Emite una factura electrónica para Acme SpA, RUT 11.111.111-1, por un ítem a 50000 CLP."

## Tipos de documento

Bsale usa `documentTypeId` numéricos que mapean a códigos SII. Los comunes:

| `documentTypeId` | SII | Tipo                        |
| ---------------- | --- | --------------------------- |
| 33               | 33  | Factura electrónica         |
| 34               | 34  | Factura exenta electrónica  |
| 39               | 39  | Boleta electrónica          |
| 41               | 41  | Boleta exenta electrónica   |
| 56               | 56  | Nota de débito electrónica  |
| 61               | 61  | Nota de crédito electrónica |

La lista completa la expone Bsale en `GET /v1/document_types.json`. Úsalo para descubrir los ids reales de tu cuenta — varían por comercio.

## Deploy

Mismo flujo de un comando que cualquier servidor mcify:

```bash
mcify deploy cloudflare      # Cloudflare Workers
mcify deploy vercel --prod   # Vercel Edge
mcify deploy fly             # Fly.io
mcify deploy railway         # Railway
mcify deploy docker --push   # Docker → registry
```

Ver [`docs/deploy/`](https://github.com/Lelemon-studio/mcify/tree/main/docs/deploy) para el detalle por target.

## Tests

```bash
pnpm --filter @mcify/example-bsale test
```

Los tests mockean `fetch` contra snapshots JSON fijos — no necesitan credenciales de Bsale en CI.

## Archivos

```
src/
├── client.ts              # BsaleClient — wrapper REST mínimo
├── client.test.ts         # Tests del cliente
└── tools/
    ├── emit-dte.ts        # bsale_emit_dte
    ├── list-invoices.ts   # bsale_list_invoices
    ├── get-invoice.ts     # bsale_get_invoice
    └── list-clients.ts    # bsale_list_clients
mcify.config.ts            # Config MCP (auth, tools)
```

## Disclaimer

No afiliado a Bsale. Este connector es comunitario y se construye sobre la API pública de Bsale.

## Licencia

Apache-2.0 (igual que mcify).
