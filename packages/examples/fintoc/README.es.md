# @mcify/example-fintoc

Servidor MCP de referencia para [Fintoc](https://fintoc.com) — open banking para Chile y México — construido con [mcify](https://mcify.dev).

> **Estado:** alpha. Ejemplo canónico de "cómo expongo un API bancario como MCP."

[Read in English](./README.md)

## Qué hace

Expone tres tools MCP que cualquier cliente compatible (Claude Desktop, Cursor, Claude Code, Lelemon Agentes, agentes propios) puede invocar:

| Tool                         | Para qué sirve                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| `fintoc_list_accounts`       | Lista todas las cuentas visibles a través de un link Fintoc (una conexión de usuario final). |
| `fintoc_get_account_balance` | Obtiene saldo disponible + saldo actual de una cuenta.                                       |
| `fintoc_list_movements`      | Lista movimientos bancarios de una cuenta, con rango de fechas opcional.                     |

Cada tool está protegida por:

- **`requireAuth`** — el agente que llama debe presentar un bearer token válido.
- **`rateLimit`** — 60–120/min por token (más bajo en movements porque los responses pesan).
- **`withTimeout`** — deadlines de 5–10s.

El agente que llama a este servidor usa **su propio** bearer token (`MCIFY_AUTH_TOKEN`). El secret key de Fintoc (`FINTOC_SECRET_KEY`) vive en el servidor y nunca llega al agente.

## Cómo funciona el auth de Fintoc

Fintoc tiene dos credenciales, ambas requeridas:

1. **Secret key** (`sk_live_...` / `sk_test_...`) — el API key de tu organización. Vive en el servidor mcify como `FINTOC_SECRET_KEY`.
2. **Link token** — un token por usuario, emitido al final del flujo de conexión bancaria de Fintoc. Identifica qué conexión de usuario consultar.

Cada tool de este servidor espera `linkToken` como input. Tu agente debería tener o buscar el link token correcto para el usuario que está atendiendo (por ejemplo, una fila por usuario en tu CRM).

## Cómo correrlo en local

```bash
# 1. Instalar deps (desde la raíz del monorepo mcify)
pnpm install

# 2. Conseguir un secret key de Fintoc
#    Iniciar sesión en https://app.fintoc.com
#    Settings → API keys → usar sk_test_ para sandbox

# 3. Configurar env vars
export FINTOC_SECRET_KEY='sk_test_...'
export MCIFY_AUTH_TOKEN="$(openssl rand -hex 32)"

# 4. Correr con el inspector
mcify dev
```

El endpoint MCP queda en `http://localhost:8888/mcp`. La UI del inspector vive en `http://localhost:3001`.

## Conectar desde Claude Desktop

Misma forma de config que los otros ejemplos mcify:

```json
{
  "mcpServers": {
    "fintoc": {
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

Reiniciar Claude Desktop. Pedir: "Lista las cuentas del link `link_abc` y muéstrame el saldo de la cuenta corriente."

## Deploy

```bash
mcify deploy cloudflare      # Cloudflare Workers
mcify deploy vercel --prod   # Vercel Edge
mcify deploy fly             # Fly.io
mcify deploy railway         # Railway
mcify deploy docker --push   # Docker → registry
```

Ver [docs.mcify.dev/deploy](https://docs.mcify.dev/deploy/overview/) para el detalle por target.

## Tests

```bash
pnpm --filter @mcify/example-fintoc test
```

Los tests mockean `fetch` contra snapshots JSON fijos — no necesitan credenciales de Fintoc en CI.

## Archivos

```
src/
├── client.ts                   # FintocClient — wrapper REST mínimo
├── client.test.ts              # Tests del cliente
└── tools/
    ├── list-accounts.ts        # fintoc_list_accounts
    ├── get-account-balance.ts  # fintoc_get_account_balance
    └── list-movements.ts       # fintoc_list_movements
mcify.config.ts                 # Config MCP (auth, tools)
```

## Disclaimer

No afiliado a Fintoc. Este connector es comunitario y se construye sobre la API pública de Fintoc.

## Licencia

Apache-2.0 (igual que mcify).
