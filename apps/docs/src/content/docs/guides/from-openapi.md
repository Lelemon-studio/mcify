---
title: From OpenAPI / microservices
description: Generate Zod-typed tools from one or more OpenAPI specs. Single command, multi-spec for microservice fleets.
---

`mcify generate from-openapi` reads an OpenAPI 3.x spec (JSON or YAML, URL or local file) and emits a TypeScript file with one `defineTool` per operation, ready to wire into your `mcify.config.ts`.

## Single spec

```bash
mcify generate from-openapi ./openapi.yaml
mcify generate from-openapi https://api.example.com/openapi.json
```

The command writes `src/generated/<slug>.ts` where `<slug>` is derived from the spec's `info.title`. The file contains:

- `create_<slug>_client(opts)` — fetch wrapper with auth detection and base URL from `servers[0]`.
- One `defineTool(...)` per operation, with input schemas built from `parameters` + JSON request bodies, output schemas from the first 2xx response.
- Component schemas (`#/components/schemas/*`) hoisted as Zod consts.
- `<slug>_tools(client)` factory returning the array of tools — drop into `tools[]` in `mcify.config.ts`.

## Multi-spec (microservices)

This is the headline use case for service fleets. Repeat `--spec` to combine N services into one MCP server with namespaced tool names:

```bash
mcify generate from-openapi \
  --spec users=https://api.tuempresa.com/users/openapi.json \
  --spec billing=https://api.tuempresa.com/billing/openapi.json \
  --spec inventory=./inventory.yaml
```

Output:

```
src/generated/
├── users.ts       # users_create_user, users_list_users, ...
├── billing.ts     # billing_emit_invoice, billing_list_invoices, ...
└── inventory.ts   # inventory_check_stock, inventory_list_skus, ...
```

Wire all three into `mcify.config.ts`:

```ts
import { bearer, defineConfig } from '@mcify/core';
import { create_users_client, users_tools } from './src/generated/users.js';
import { create_billing_client, billing_tools } from './src/generated/billing.js';
import { create_inventory_client, inventory_tools } from './src/generated/inventory.js';

const usersClient = create_users_client({ token: process.env.USERS_API_TOKEN });
const billingClient = create_billing_client({ token: process.env.BILLING_API_TOKEN });
const inventoryClient = create_inventory_client({ token: process.env.INVENTORY_API_TOKEN });

export default defineConfig({
  name: 'company-aggregator',
  version: '0.1.0',
  auth: bearer({ env: 'MCIFY_AUTH_TOKEN' }),
  tools: [
    ...users_tools(usersClient),
    ...billing_tools(billingClient),
    ...inventory_tools(inventoryClient),
  ],
});
```

The agent sees one unified catalog of (e.g.) 47 tools with stable, prefixed names. You deploy one binary.

## What gets mapped

| OpenAPI                                                 | Zod                            | Notes                                             |
| ------------------------------------------------------- | ------------------------------ | ------------------------------------------------- |
| `type: string`, format `email`/`uri`/`uuid`/`date-time` | `z.string().email()` etc.      | Format hints honored                              |
| `type: integer` with `minimum`/`maximum`                | `z.number().int().min().max()` |                                                   |
| `type: boolean`                                         | `z.boolean()`                  |                                                   |
| `type: array`, `items`                                  | `z.array(...)`                 |                                                   |
| `type: object` with `properties`, `required`            | `z.object({...})`              | Optional fields get `.optional()`                 |
| `enum`                                                  | `z.enum([...])`                | String enums; mixed-type → `z.union(z.literal())` |
| `oneOf` / `anyOf`                                       | `z.union([...])`               |                                                   |
| `allOf`                                                 | `z.intersection(...)`          | Folded for >2 parts                               |
| `nullable: true`                                        | `.nullable()`                  | OpenAPI 3.0                                       |
| `additionalProperties: <Schema>`                        | `z.record(...)`                | When no fixed `properties`                        |
| `$ref: '#/components/schemas/X'`                        | identifier                     | Hoisted as a top-level Zod const                  |

Anything the generator can't model emits `z.unknown()` with a `// TODO` comment. Open an issue if you hit one — most are easy to add.

## Auth detection

The generator reads the spec's `securitySchemes` and configures the client:

| OpenAPI                    | Generated client behavior                   |
| -------------------------- | ------------------------------------------- |
| `http`, `scheme: bearer`   | `Authorization: Bearer ${opts.token}`       |
| `http`, `scheme: basic`    | `Authorization: Basic ${opts.token}`        |
| `apiKey`, `in: header`     | The configured header name → `opts.token`   |
| `apiKey`, `in: query`      | TODO comment — append to URL manually       |
| `oauth2` / `openIdConnect` | TODO comment — wire your own token issuance |

Pass `token` when constructing the client; the generated code mutates a per-request copy of headers (never the caller's object).

## Common workflows

### Regenerate when the spec changes

The output is deterministic. Re-run the generator and diff:

```bash
mcify generate from-openapi --spec users=https://...
git diff src/generated/users.ts
```

Anything in `src/generated/` is fine to commit — it's reviewable and gives you a real diff when the upstream changes.

### Hand-edit a generated tool's description

OpenAPI summaries are often vague. The generator copies them verbatim, but you can edit the descriptions in `src/generated/<prefix>.ts` directly. They survive regeneration only if the source spec doesn't change the operation; otherwise you're back to the upstream description (or you put your edits in a separate wrapper tool that calls the generated one).

The cleaner pattern: write a thin wrapper in `src/tools/` that calls the generated client directly and exposes a tool with your description:

```ts
// src/tools/users-find-by-email.ts
import { defineTool } from '@mcify/core';
import { z } from 'zod';
import { create_users_client } from '../generated/users.js';

const client = create_users_client({ token: process.env.USERS_API_TOKEN });

export const usersFindByEmail = defineTool({
  name: 'users_find_by_email',
  description: 'Find a single user by exact email match. Returns null if not found.',
  input: z.object({ email: z.string().email() }),
  output: z.object({ id: z.string(), email: z.string(), fullName: z.string() }).nullable(),
  handler: async ({ email }) => {
    const result = await client.request({
      method: 'GET',
      url: `/users?email=${encodeURIComponent(email)}`,
      headers: { accept: 'application/json' },
    });
    const list = result as { users: Array<{ id: string; email: string; fullName: string }> };
    return list.users[0] ?? null;
  },
});
```

That tool isn't generated and won't be overwritten; it composes the generated client.

## Limits

- The generator skips `deprecated: true` operations.
- Non-JSON request bodies (multipart, form-encoded) emit a `// TODO` comment in the handler.
- It reads only `servers[0]` for the base URL.
- It does not generate documentation pages — only the TypeScript file. Pair with the [Wrap-an-API prompt](/prompts/wrap-api/) if you want a full connector with README and tests.

## See also

- [AI prompt → Wrap an API](/prompts/wrap-api/) — when you want a hand-tuned connector instead of generated tools.
- [AI prompt → Migrate to multi-spec](/prompts/migrate-multispec/) — adding more services to an existing server.
