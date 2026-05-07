# @mcify/example-bsale

Servidor MCP **multi-tenant** para [Bsale](https://www.bsale.io) — DTE / facturación electrónica chilena — construido con [mcify](https://mcify.dev).

> **Estado:** alpha. Forma de producción: **un único deploy** sirve a muchos comercios, cada uno con su propio `access_token` de Bsale. El agente nunca ve la credencial — solo el bearer token que se le emitió en el onboarding.

[Read in English](./README.md)

## Qué hace

Expone cuatro tools MCP que cualquier cliente compatible (Claude Desktop, Cursor, Claude Code, Lelemon Agentes, agentes propios) puede invocar contra cualquier comercio Bsale conectado al servidor:

| Tool                  | Para qué sirve                                                             |
| --------------------- | -------------------------------------------------------------------------- |
| `bsale_emit_dte`      | Emite un DTE (factura/boleta) y devuelve número, total y URLs del PDF/XML. |
| `bsale_list_invoices` | Lista documentos emitidos. Filtra por rango de fecha y tipo de documento.  |
| `bsale_get_invoice`   | Busca un documento por id. Devuelve la misma forma que `bsale_emit_dte`.   |
| `bsale_list_clients`  | Encuentra clientes por RUT o email.                                        |

Cada tool está protegida por:

- **`requireAuth`** — el agente que llama debe presentar un bearer token registrado en el session store.
- **`rateLimit`** — emit 30/min, lecturas 120–240/min por token (más bajo en emit porque los DTE tienen peso legal).
- **`withTimeout`** — deadlines de 5–15s.

## Arquitectura (multi-tenant)

```
        Comercio Bsale A         Comercio Bsale B         Comercio Bsale C
              │                          │                          │
       access_token A             access_token B             access_token C
              │                          │                          │
              └──────────────┬───────────┴──────────────┬──────────┘
                             ▼                          ▼
                ┌─────────────────────────────────────────┐
                │          UN deploy de mcify             │
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

Cada comercio presenta **su propio bearer token** (emitido por el operador en el onboarding). El servidor resuelve bearer → credenciales del comercio y el handler usa el token Bsale correcto. El agente **nunca ve** la credencial upstream.

## Correrlo en local (multi-tenant desde el día 1)

```bash
# 1. Instalar deps desde la raíz del monorepo mcify
pnpm install

# 2. Build (el CLI admin lee desde dist/)
pnpm --filter @mcify/example-bsale build

# 3. Onboardear el primer comercio. El CLI genera un bearer si no le
#    pasás uno, y muestra el snippet de Claude Desktop para
#    entregárselo al comercio.
node scripts/admin.mjs add acme-spa \
  $(openssl rand -hex 32) \
  bs_xxxxxxxxxxxx_su_token_bsale

# 4. (Opcional) onboardear más comercios igual:
node scripts/admin.mjs add segundo-comercio <bearer> <tokenBsale>

# 5. Correr el dev server
pnpm dev
```

El session store vive en `./sessions.json` (override con `BSALE_SESSIONS_PATH`). Para producción, reemplazá `JsonFileBsaleSessionStore` por una implementación contra tu DB (ver "Almacenamiento" abajo).

Endpoint MCP: `http://localhost:8888/mcp`. Inspector: `http://localhost:3001`.

## Flujo de onboarding (lo que hace el operador)

1. Comercio nuevo se registra (canal tuyo: form, email, programa de partners).
2. Comercio entra a `app.bsale.io` → **Configuración → API → "Crear Token"** y copia su `access_token`.
3. Operador recibe el token (por canal seguro — nunca email).
4. Operador corre:

   ```bash
   node scripts/admin.mjs add <slug-comercio> <bearer-o-omitir-para-generar> <access-token-bsale>
   ```

   El CLI muestra el bearer + el snippet de Claude Desktop para enviar de vuelta.

5. Comercio pega el snippet en Claude Desktop / Cursor / su agente. Reinicia. Las tools aparecen.

Para revocar acceso:

```bash
node scripts/admin.mjs revoke <bearer-token>
```

Para listar sesiones activas:

```bash
node scripts/admin.mjs list
```

## Cómo se conecta el comercio (Claude Desktop)

El operador le entrega esta config:

```json
{
  "mcpServers": {
    "bsale": {
      "url": "https://bsale-mcp.tu-host.com/mcp",
      "headers": {
        "authorization": "Bearer EL_BEARER_QUE_APROVISIONÓ_EL_OPERADOR"
      }
    }
  }
}
```

La pegan en `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) o `%APPDATA%\Claude\claude_desktop_config.json` (Windows), reinician, y piden: "Emite una factura electrónica para Acme SpA, RUT 11.111.111-1, por un ítem a 50000 CLP."

## Almacenamiento

Dos adapters incluidos:

| Adapter                     | Cuándo usarlo                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `MemoryBsaleSessionStore`   | Tests, dev local. Se borra en cada reinicio.                                                                     |
| `JsonFileBsaleSessionStore` | Deploys single-host con filesystem escribible (volúmenes Fly, discos Railway, máquina propia). Default para dev. |

Para producción a escala (muchos orgs, multi-host, HA): implementás la interfaz `BsaleSessionStore` contra tu DB real (Postgres, Cloudflare D1, KV, DynamoDB) y la inyectás en `mcify.config.ts` reemplazando la JSON-file. La interfaz es chica:

```ts
interface BsaleSessionStore {
  resolveBearer(bearerToken: string): Promise<BsaleSession | null>;
}
```

El admin store (que usa el CLI) extiende con `add`, `revoke`, `list`. Ver [`src/sessions.ts`](./src/sessions.ts).

## Modelo de seguridad

- **El `access_token` de Bsale nunca sale del servidor.** Ni siquiera el agente que invoca una tool puede verlo — los handlers lo buscan en el store usando el bearer validado, nunca desde el envelope del request.
- **El bearer se valida en el borde** antes de que corra ningún handler. Tokens desconocidos / revocados → 401.
- **No hay campo `orgId` en los inputs de las tools.** El servidor resuelve el org desde el bearer; el agente no puede suplantar a otro org pasando un `orgId` distinto.
- **Revocación es un comando.** Los tokens revocados son rechazados en el siguiente request.

## Deploy

Servicio multi-tenant productivo: necesita un target con storage persistente:

```bash
mcify deploy fly                         # región scl default, scale-to-zero
# o
mcify deploy railway                     # si ya estás en Railway
# o
mcify deploy docker --push               # después helm install ./charts/mcify con un PVC
```

Cloudflare Workers / Vercel Edge NO recomendados con el `JsonFileBsaleSessionStore` por default — no tienen filesystem escribible. O pareás el deploy con un store contra DB (Cloudflare D1, KV) o elegís un target con disco.

Detalle por target: [docs.mcify.dev/deploy](https://docs.mcify.dev/deploy/overview/).

## Tests

```bash
pnpm --filter @mcify/example-bsale test
```

19 tests cubren el cliente Bsale (con `fetch` mockeado), el session store en memoria, y el JSON-file (persistencia + writes atómicos). No requieren credenciales reales.

## Por qué este es el patrón canónico multi-tenant

Este connector es la referencia para cualquier juego "MCPs as a service" sobre mcify:

- **Un operador** (vos) hostea un único deploy.
- **Muchos comercios** se registran y entregan su credencial upstream en el onboarding.
- **Muchos agentes** (uno por comercio, posiblemente varios usuarios por comercio) se conectan con sus propios bearer tokens.
- **Cero leak de credenciales**: los tokens upstream viven server-side, indexados por bearer.

El mismo patrón aplica a cualquier vendor con API keys per-tenant — Stripe Connect (sub-merchant), HubSpot per-portal, tu propia SaaS API. Cambiás "Bsale" por el vendor y el esqueleto del connector queda igual.

## Disclaimer

No afiliado a Bsale. Este connector es comunitario y se construye sobre la API pública de Bsale.

## Licencia

Apache-2.0 (igual que mcify).
