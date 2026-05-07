# @mcify/example-simplefactura

Servidor MCP **multi-tenant** para [SimpleFactura](https://www.simplefactura.cl) — facturación electrónica chilena (DTE, BHE) — construido con [mcify](https://mcify.dev).

> **Estado:** alpha. Forma de producción: **un único deploy** sirve a muchas cuentas SimpleFactura, y cada cuenta puede operar muchas empresas. El agente nunca ve credenciales — solo el bearer token emitido en el onboarding.

[Read in English](./README.md)

## Qué hace

Expone 13 tools MCP que cualquier cliente compatible (Claude Desktop, Cursor, Claude Code, Lelemon Agents, agentes propios) puede invocar.

### Emisión

| Tool                             | Para qué sirve                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `simplefactura_emit_dte`         | Emite factura/boleta (33, 34, 39, 41) con un `DteInput` agnóstico al vendor. El connector arma el shape SII y calcula totales. |
| `simplefactura_emit_credit_note` | Emite Nota de Crédito (61) o Débito (56) con referencia obligatoria al documento original.                                     |

### Lectura

| Tool                                    | Para qué sirve                                       |
| --------------------------------------- | ---------------------------------------------------- |
| `simplefactura_list_documents`          | Lista DTEs emitidos con filtros de fecha/tipo/folio. |
| `simplefactura_get_document`            | Busca un DTE por folio + tipo.                       |
| `simplefactura_list_received_documents` | Lista DTEs recibidos de proveedores (compras).       |
| `simplefactura_list_clients`            | Lista el catálogo de clientes.                       |
| `simplefactura_get_client_by_rut`       | Busca un cliente por RUT.                            |
| `simplefactura_list_products`           | Lista el catálogo de productos.                      |
| `simplefactura_list_branch_offices`     | Lista las sucursales registradas.                    |
| `simplefactura_get_company_info`        | Datos del emisor (RUT, razón social, giro, ACTECO).  |

### Boletas de Honorarios

| Tool                              | Para qué sirve                                 |
| --------------------------------- | ---------------------------------------------- |
| `simplefactura_list_bhe_issued`   | Lista BHE emitidas (caso freelance/consultor). |
| `simplefactura_list_bhe_received` | Lista BHE recibidas de prestadores.            |

### Folios

| Tool                         | Para qué sirve                                                   |
| ---------------------------- | ---------------------------------------------------------------- |
| `simplefactura_check_folios` | Cuántos folios disponibles tiene la empresa para un tipo de DTE. |

Cada tool está protegida por:

- **`requireAuth`** — el agente debe presentar un bearer token válido.
- **`rateLimit`** — emisión 30/min, NC/ND 15/min, lecturas 60–120/min.
- **`withTimeout`** — 5–15s.

## Por qué multi-tenant en dos niveles (una credencial → muchas empresas)

SimpleFactura tiene una particularidad única en el ecosistema chileno: **una sola cuenta de usuario (email + password) puede operar muchas empresas**. Cada endpoint de negocio recibe un objeto `Credenciales` que indica sobre cuál empresa actuar (`RutEmisor`).

El connector lo modela en dos niveles:

```
bearer token  →  org id (una cuenta SimpleFactura: email + password)
              →  JWT cacheado (auto-refrescado)
              →  empresas: { userKey → { rutEmisor, ... } }
```

Esto convierte al **caso contador-PyME** en ciudadano de primera clase: un contador opera 10 empresas chiquitas desde un único deploy, y el agente elige la empresa correcta con un `userKey`.

```
     Cuenta SimpleFactura A         Cuenta SimpleFactura B
     ─────────────────────────       ─────────────────────────
     email + password A              email + password B (contador)
     empresa "main"                  empresa "cliente-1"
                                      empresa "cliente-2"
                                      empresa "cliente-3"
            │                                 │
            └──────────────┬──────────────────┘
                           ▼
           ┌─────────────────────────────────────────┐
           │          UN deploy de mcify             │
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

## Correrlo en local

```bash
# 1. Instalar deps desde la raíz del monorepo mcify
pnpm install

# 2. Onboardear la primera org. El CLI genera un bearer si no pasás uno.
pnpm --filter @mcify/example-simplefactura admin add-org \
  lelemon contacto@lelemon.cl tu-password

# 3. Bindear una o más empresas bajo userKeys estables:
pnpm --filter @mcify/example-simplefactura admin add-empresa \
  <bearer> main 76.000.000-0 26.429.782-6 "Casa Matriz"

# 4. (Opcional) pinear empresa default para que las tools sin `userKey` anden:
pnpm --filter @mcify/example-simplefactura admin set-default <bearer> main

# 5. Levantar el dev server
pnpm --filter @mcify/example-simplefactura dev
```

El session store vive en `./sessions.json` (override con `SIMPLEFACTURA_SESSIONS_PATH`). Para producción a escala, reemplazá `JsonFileSimpleFacturaSessionStore` por una implementación contra tu DB.

Endpoint MCP: `http://localhost:8888/mcp`. Inspector: `http://localhost:3001`.

## Flujo de onboarding (lo que hace el operador)

1. La org nueva se registra (tu canal: form, email, partners).
2. Provee email + password de su cuenta SimpleFactura.
3. Operador recibe credenciales por canal seguro (nunca email).
4. Operador corre:

   ```bash
   pnpm admin add-org <orgId> <email> <password> [bearer-o-omitir-para-generar]
   ```

5. Operador bindea una o más empresas:

   ```bash
   # Caso single-empresa (la mayoría):
   pnpm admin add-empresa <bearer> main 76.000.000-0
   pnpm admin set-default <bearer> main

   # Caso contador (una credencial, varias empresas):
   pnpm admin add-empresa <bearer> cliente-1 11.111.111-1
   pnpm admin add-empresa <bearer> cliente-2 22.222.222-2
   ```

Para revocar org entera:

```bash
pnpm admin revoke-org <bearer>
```

Para revocar una empresa puntual (el resto sigue activo):

```bash
pnpm admin revoke-empresa <bearer> <userKey>
```

## Caso contador, explícito

Un contador chileno que administra 10 empresas chiquitas pega las mismas credenciales SimpleFactura una sola vez. El operador bindea 10 empresas con `userKey`s estables:

```bash
pnpm admin add-org contador-perez contador@firma.cl <password>
pnpm admin add-empresa <bearer> distribuidora-norte 76.000.000-0
pnpm admin add-empresa <bearer> dental-providencia 76.111.111-1
# ...8 más
```

El agente habla de empresas por `userKey`:

> _"Cambia a `dental-providencia` y emite la boleta del mes a su cliente recurrente."_

El connector resuelve `userKey="dental-providencia"` a su `rutEmisor` y `nombreSucursal` server-side, arma el `Credenciales` que SimpleFactura espera, y emite el DTE — sin exponer nada al LLM.

## Cómo se conecta la org (Claude Desktop)

```json
{
  "mcpServers": {
    "simplefactura": {
      "url": "https://simplefactura-mcp.tu-host.com/mcp",
      "headers": {
        "authorization": "Bearer EL_BEARER_QUE_APROVISIONÓ_EL_OPERADOR"
      }
    }
  }
}
```

Lo pegan en `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) o `%APPDATA%\Claude\claude_desktop_config.json` (Windows), reinician, y piden: _"Emite una boleta por $80.000 a Acme RUT 11.111.111-1."_

## Qué cubre (y qué no)

| Producto SimpleFactura                                    | Estado                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------ |
| Facturación electrónica (33, 34, NC, ND, exenciones)      | ✅ via `simplefactura_emit_dte` + `simplefactura_emit_credit_note` |
| Boletas electrónicas (39, 41)                             | ✅                                                                 |
| Boletas de Honorarios (BHE emitidas + recibidas, listado) | ✅                                                                 |
| Documentos recibidos (compras)                            | ✅                                                                 |
| Folios — consultar disponibles                            | ✅                                                                 |
| Catálogo (clientes, productos, sucursales)                | ✅                                                                 |
| Datos empresa                                             | ✅                                                                 |
| **Folios — solicitar al SII**                             | Roadmap                                                            |
| **Emisión masiva (multipart CSV)**                        | Roadmap                                                            |
| **Guías de despacho electrónicas (52)**                   | Fuera de scope v1                                                  |
| **DTEs de exportación (110, 111, 112)**                   | Fuera de scope v1                                                  |

## Tipos agnósticos al vendor

Los tipos de input/output (`DteInput`, `DteResult`, `DteItem`, `DteReceptor`, `DteDescuentoGlobal`) están diseñados para ser **portables** entre vendors del DTE chileno (Bsale, SimpleFactura, Nubox, Defontana). Cada connector mapea desde `DteInput` al payload nativo del vendor — el schema del tool es el mismo independiente del vendor que lo respalde.

Los tipos viven inline en `src/types-dte.ts` por ahora; se mueven a `@mcify/dte-chile` cuando un segundo connector los adopte.

## Semántica de monedas y montos

Todos los montos son **enteros en CLP** (sin decimales). `MntNeto`, `MntExe`, `IVA`, `MntTotal` siempre suman correcto. El helper `calculateTotales` aplica:

- Tipos full-exentos (34, 41) → todos los items van a `MntExe`, IVA 0.
- Mixto: items con `exento: true` dentro de un documento afecto van a `MntExe`.
- IVA = 19% sobre `MntNeto` (tasa chilena vigente).
- Descuentos/recargos globales aplican a `MntNeto` si hay neto, sino a `MntExe`.

## Almacenamiento

| Adapter                             | Cuándo usarlo                                            |
| ----------------------------------- | -------------------------------------------------------- |
| `MemorySimpleFacturaSessionStore`   | Tests, dev local. Se borra en cada reinicio.             |
| `JsonFileSimpleFacturaSessionStore` | Single-host con filesystem escribible. Default para dev. |

Para producción a escala: implementás `SimpleFacturaSessionStore` contra tu DB real:

```ts
interface SimpleFacturaSessionStore {
  resolveBearer(bearerToken: string): Promise<SimpleFacturaSession | null>;
  updateToken(bearerToken: string, token: SimpleFacturaTokenCache): Promise<void>;
}
```

El admin store extiende con `add`, `revoke`, `addEmpresa`, `revokeEmpresa`, `setDefault`, `list`. Ver [`src/sessions.ts`](./src/sessions.ts).

## Modelo de seguridad

- **Email + password nunca salen del servidor.** Ni el agente que invoca una tool puede verlos — los handlers los buscan en el store usando el bearer validado.
- **JWT cacheado con auto-refresh.** Cuando un token vence (o el server devuelve 401), el cliente re-autentica transparente y reintenta. El nuevo token se persiste de vuelta via `updateToken`.
- **Sin `RutEmisor` en los inputs.** El agente pasa un `userKey` estable; el servidor resuelve las `Credenciales`. Esto evita que un LLM invente o cross-pollinate contextos de empresa.
- **Sin `orgId` en los inputs.** El servidor resuelve la org desde el bearer.
- **Bearer se valida en el borde** antes de cualquier handler.
- **Revocación es un comando.** A nivel org (`revoke-org`) o por empresa (`revoke-empresa`).

## Deploy

Servicio multi-tenant productivo — necesita target con storage persistente:

```bash
mcify deploy fly                         # región scl default, scale-to-zero
# o
mcify deploy railway                     # si ya estás en Railway
# o
mcify deploy docker --push               # después helm install ./charts/mcify con un PVC
```

Cloudflare Workers / Vercel Edge NO recomendados con el JSON store por default — sin filesystem escribible. Pareá con un store contra DB.

Detalle por target: [docs.mcify.dev/deploy](https://docs.mcify.dev/deploy/overview/).

## Tests

```bash
pnpm --filter @mcify/example-simplefactura test
```

79 tests cubren:

- Cliente REST con `fetch` mockeado (auth flow, JWT cache, refresh, 401 retry, error envelope + ProblemDetails).
- Stores `Memory` y `JsonFile` (multi-empresa, default fallback, writes atómicos).
- `calculateTotales` (IVA 19%, exentos, descuentos globales, edge cases).
- `buildRequestDTE` (factura, boleta, NC/ND, descuentos, referencias, exento mixto).
- Integración de cada tool con el session store.

No requieren credenciales reales.

## Archivos

```
src/
├── client.ts                    # SimpleFacturaClient — auth JWT + refresh + retry
├── client.test.ts               # 10 tests
├── sessions.ts                  # SessionStore + Memory + JsonFile + resolveCredenciales
├── sessions.test.ts             # 38 tests
├── types-dte.ts                 # Tipos agnósticos al vendor (portables)
├── totales.ts                   # IVA + exentos + descuentos globales
├── totales.test.ts              # 12 tests
├── builders.ts                  # buildRequestDTE — DteInput → shape SII
├── builders.test.ts             # 10 tests
└── tools/                       # 13 tools, cada una con su handler
scripts/
├── admin.ts                     # CLI: add-org / add-empresa / set-default / revoke-* / list
└── demo-e2e.ts                  # Smoke test E2E contra demo@chilesystems.com
mcify.config.ts                  # bearer({ verify }) → SessionStore lookup
```

## Disclaimer

No afiliado a SimpleFactura ni Chilesystems. Connector comunitario sobre la API pública de SimpleFactura.

## Licencia

Apache-2.0 (igual que mcify).
