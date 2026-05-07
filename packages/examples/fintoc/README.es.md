# @mcify/example-fintoc

Servidor MCP **multi-tenant** para [Fintoc](https://fintoc.com) — open banking para Chile y México — construido con [mcify](https://mcify.dev).

> **Estado:** alpha. Forma de producción: **un único deploy** sirve a muchos comercios, cada uno con su propio `secret_key` de Fintoc y un set de `link_token`s per-usuario. El agente nunca ve ninguna credencial — solo el bearer token que se le emitió en el onboarding.

[Read in English](./README.md)

## Qué hace

Expone cuatro tools MCP que cualquier cliente compatible (Claude Desktop, Cursor, Claude Code, Lelemon Agents, agentes propios) puede invocar contra cualquier comercio Fintoc conectado al servidor:

| Tool                         | Para qué sirve                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `fintoc_list_accounts`       | Lista las cuentas bancarias visibles a través del link Fintoc de un end-user, con titular, moneda y saldos.                 |
| `fintoc_get_account_balance` | Devuelve el saldo disponible + actual de una cuenta puntual.                                                                |
| `fintoc_list_movements`      | Lista movimientos bancarios de una cuenta. Filtro por rango de fecha, paginación cursor automática, mapeo sender/recipient. |
| `fintoc_refresh_movements`   | Dispara un refresh on-demand para reflejar movimientos recientes. Asincrónico (entrega vía webhook).                        |

Cada tool está protegida por:

- **`requireAuth`** — el agente que llama debe presentar un bearer token registrado en el session store.
- **`rateLimit`** — lecturas 60–120/min, refresh 5/min por token.
- **`withTimeout`** — deadlines de 5–15s.

## Por qué dos credenciales (y qué es `userKey`)

El modelo de auth de Fintoc tiene dos capas:

1. **`secret_key` org-level** (`sk_test_…` / `sk_live_…`) — uno por cuenta Fintoc. Autoriza la llamada al API.
2. **`link_token` per-end-user** — emitido por el Widget de Fintoc cuando un end-user (por ejemplo, un cliente del comercio) conecta su cuenta bancaria. Limita las consultas a las cuentas de ese end-user.

El connector expone un **`userKey` estable y opaco** (el RUT del end-user, un id interno, lo que prefieras) como input de las tools. El session store mapea `(bearer → org → userKey → link_token)` server-side. El agente habla de los usuarios por `userKey`; nunca ve ni elige el `link_token`.

## Arquitectura (multi-tenant)

```
       Comercio Fintoc A             Comercio Fintoc B
       ───────────────────           ───────────────────
       secret_key A                  secret_key B
       link_token user A1            link_token user B1
       link_token user A2            link_token user B2
              │                              │
              └──────────────┬──────────────┘
                             ▼
             ┌─────────────────────────────────────────┐
             │          UN deploy de mcify             │
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

## Flujo del end-user (de dónde salen los `link_token`s)

El connector **no** monta el Widget de Fintoc — eso es responsabilidad del comercio. La cadena es:

```
Backend del comercio ─→ crea un Link via API/dashboard de Fintoc ─→ widgetToken
Frontend del comercio ─→ carga @fintoc/fintoc-js ─→ end-user pone credenciales bancarias
Backend de Fintoc ─→ MFA, validación ─→ emite link_token ─→ POST webhook al comercio
Operador del comercio ─→ pnpm admin add-link <bearer> <userKey> <link_token>
```

A partir de ahí el agente del comercio puede llamar `fintoc_list_movements` con el `userKey` que ya conoce. El connector resuelve el `link_token` server-side.

## Correrlo en local

```bash
# 1. Instalar deps desde la raíz del monorepo mcify
pnpm install

# 2. Onboardear el primer comercio. El CLI genera un bearer si no le
#    pasás uno, y muestra el snippet de Claude Desktop.
pnpm --filter @mcify/example-fintoc admin add-org acme-spa sk_test_xxxxxxxx

# 3. Bindear uno o más link_tokens de end-users bajo userKeys estables:
pnpm --filter @mcify/example-fintoc admin add-link <bearer> 11.111.111-1 link_xxx
pnpm --filter @mcify/example-fintoc admin add-link <bearer> 22.222.222-2 link_yyy

# 4. Correr el dev server
pnpm --filter @mcify/example-fintoc dev
```

El session store vive en `./sessions.json` (override con `FINTOC_SESSIONS_PATH`). Para producción, reemplazá `JsonFileFintocSessionStore` por una implementación contra tu DB (ver "Almacenamiento" abajo).

Endpoint MCP: `http://localhost:8888/mcp`. Inspector: `http://localhost:3001`.

## Flujo de onboarding (lo que hace el operador)

1. Comercio nuevo se registra (canal tuyo: form, email, programa de partners).
2. Comercio entra a `app.fintoc.com` → **Settings → API keys** y copia su `secret_key` (`sk_test_…` para sandbox, `sk_live_…` para producción).
3. Operador recibe el secret por canal seguro (nunca email).
4. Operador corre:

   ```bash
   pnpm admin add-org <slug-comercio> <secret_key> [bearer-o-omitir-para-generar]
   ```

   El CLI imprime el bearer + el snippet de Claude Desktop para enviar de vuelta.

5. Cada vez que un end-user del comercio completa el flujo del Widget, el backend del comercio recibe un webhook con el `link_token`. El operador (o un job automatizado) lo registra:

   ```bash
   pnpm admin add-link <bearer> <userKey-estable> <link_token>
   ```

Para revocar un comercio entero:

```bash
pnpm admin revoke-org <bearer>
```

Para revocar el binding de un solo end-user (el resto del comercio sigue activo):

```bash
pnpm admin revoke-link <bearer> <userKey>
```

Para listar sesiones:

```bash
pnpm admin list
```

## Cómo se conecta el comercio (Claude Desktop)

El operador le entrega esta config:

```json
{
  "mcpServers": {
    "fintoc": {
      "url": "https://fintoc-mcp.tu-host.com/mcp",
      "headers": {
        "authorization": "Bearer EL_BEARER_QUE_APROVISIONÓ_EL_OPERADOR"
      }
    }
  }
}
```

La pegan en `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) o `%APPDATA%\Claude\claude_desktop_config.json` (Windows), reinician, y piden: "Mostrame los movimientos de los últimos 30 días del usuario 11.111.111-1."

## Qué cubre (y qué no)

| Producto Fintoc              | Endpoints                                                        | Estado                     |
| ---------------------------- | ---------------------------------------------------------------- | -------------------------- |
| Movements / Data Aggregation | `/v1/accounts`, `/v1/accounts/:id`, `/v1/accounts/:id/movements` | ✅ — con paginación cursor |
| Refresh Intents              | `POST /v1/refresh_intents`                                       | ✅                         |
| Smart Checkout               | `POST /v2/checkout_sessions`, payment intents                    | Roadmap                    |
| Subscriptions / Recurring    | Subscription intents                                             | Roadmap                    |
| Transfers / Payouts          | `/v1/transfers` (requiere JWS keys)                              | Fuera de scope             |
| Direct Debit                 | `/v1/direct_debits`                                              | Fuera de scope             |

El connector pinea el header `Fintoc-Version` (actualmente `2026-02-01`) para que el comportamiento sea estable entre rollouts del API. Overridable por org via el campo `fintocVersion` de la sesión.

## Semántica de monedas y montos

Todos los `amount` y `balance` son **enteros en la unidad mínima de la moneda**:

- `CLP` no tiene decimales — los valores son pesos enteros. `25000` significa `$25.000 CLP`.
- `MXN` está en centavos — `25000` significa `$250.00 MXN`.

Los valores negativos son movimientos salientes. Los entrantes exponen `senderAccount`; los salientes exponen `recipientAccount`.

## Almacenamiento

Dos adapters incluidos:

| Adapter                      | Cuándo usarlo                                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `MemoryFintocSessionStore`   | Tests, dev local. Se borra en cada reinicio.                                                                     |
| `JsonFileFintocSessionStore` | Deploys single-host con filesystem escribible (volúmenes Fly, discos Railway, máquina propia). Default para dev. |

Para producción a escala (muchos orgs, multi-host, HA): implementás la interfaz `FintocSessionStore` contra tu DB real (Postgres, Cloudflare D1, KV, DynamoDB) y la inyectás en `mcify.config.ts` reemplazando la JSON-file. La interfaz es chica:

```ts
interface FintocSessionStore {
  resolveBearer(bearerToken: string): Promise<FintocSession | null>;
}
```

El admin store (que usa el CLI) extiende con `add`, `revoke`, `addLink`, `revokeLink`, `list`. Ver [`src/sessions.ts`](./src/sessions.ts).

## Modelo de seguridad

- **El `secret_key` y los `link_token`s nunca salen del servidor.** Ni el agente que invoca una tool puede verlos — los handlers los buscan en el store usando el bearer validado, nunca desde el envelope del request.
- **Sin `linkToken` en los inputs de las tools.** El agente pasa un `userKey` estable; el servidor resuelve el link real. Esto evita que un LLM invente o cross-pollinate link tokens.
- **Sin `orgId` en los inputs.** El servidor resuelve el org desde el bearer; el agente no puede suplantar a otro org.
- **El bearer se valida en el borde** antes de que corra ningún handler. Tokens desconocidos / revocados → 401.
- **Revocación es un comando.** A nivel org (`revoke-org`) o por end-user (`revoke-link`).

## Deploy

Servicio multi-tenant productivo: necesita un target con storage persistente:

```bash
mcify deploy fly                         # región scl default, scale-to-zero
# o
mcify deploy railway                     # si ya estás en Railway
# o
mcify deploy docker --push               # después helm install ./charts/mcify con un PVC
```

Cloudflare Workers / Vercel Edge NO recomendados con el `JsonFileFintocSessionStore` por default — no tienen filesystem escribible. O pareás el deploy con un store contra DB (Cloudflare D1, KV) o elegís un target con disco.

Detalle por target: [docs.mcify.dev/deploy](https://docs.mcify.dev/deploy/overview/).

## Tests

```bash
pnpm --filter @mcify/example-fintoc test
```

41 tests cubren el cliente Fintoc (con `fetch` mockeado, incluyendo paginación via header `Link` y pinning de `Fintoc-Version`), el session store en memoria, y el JSON-file (persistencia + writes atómicos). No requieren credenciales reales.

## Archivos

```
src/
├── client.ts              # FintocClient — wrapper REST con versioning + paginación cursor
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

## Por qué este es el patrón canónico two-credential multi-tenant

Muchos vendors separan credenciales así: API key org-level + token per-end-user (Plaid item access, Stripe Connect account, Salesforce per-org-per-user). Este connector es la referencia para esa forma:

- **Un operador** (vos) hostea un único deploy.
- **Muchos comercios** se registran y entregan su credencial org-level en el onboarding.
- **Muchos end-users** por comercio quedan registrados con sus tokens per-user a medida que el comercio los onboardea.
- **Muchos agentes** se conectan con su bearer + preguntan por end-users por `userKey` estable.
- **Cero leak de credenciales**: secrets de org y per-user viven server-side, indexados por bearer + userKey.

## Disclaimer

No afiliado a Fintoc. Este connector es comunitario y se construye sobre la API pública de Fintoc.

## Licencia

Apache-2.0 (igual que mcify).
