---
'@mcify/cli': minor
---

Two new ways to bootstrap an mcify project — closes Phase C.4.

**Template `from-zod`.** `mcify init my-server --template from-zod`
scaffolds a code-first project with all schemas centralized in
`src/schemas.ts`, two example tools that import them, and `defineConfig`
in `mcify.config.ts`. The pattern: one canonical Zod definition per
shape, reused across every tool and every test. Includes the standard
AGENTS.md so AI assistants know the conventions.

**Generator `generate from-openapi`.** New subcommand:

```bash
# Single spec
mcify generate from-openapi ./openapi.yaml

# Multi-microservice — repeat --spec for each service
mcify generate from-openapi \
  --spec users=https://api.example.com/users/openapi.json \
  --spec billing=https://api.example.com/billing/openapi.json \
  --spec inventory=./inventory.yaml
```

Each spec produces one file at `src/generated/<prefix>.ts`:

- A `create_<prefix>_client(opts)` factory that handles the spec's
  `servers[0]` base URL, the security scheme detected (bearer / basic
  HTTP / API-key in header), and `fetch` injection for tests.
- One `defineTool(...)` per OpenAPI operation, with input schemas
  built from `parameters` + JSON request bodies, output schemas from
  the first 2xx response, and a handler that translates path params
  with `encodeURIComponent`.
- Component schemas (`#/components/schemas/*`) hoisted as top-level
  Zod consts so tools reference them by name.
- A `<prefix>_tools(client)` factory that returns the array — drop it
  into `tools[]` in your `mcify.config.ts`.

For multi-spec runs, prefixes prevent tool-name collisions
(`users_list_users`, `billing_emit_invoice`, …). The agent sees one
unified catalog; you deploy one MCP server.

Supports OpenAPI 3.0 and 3.1, JSON and YAML (auto-detected from
extension or content-type when fetched). Schema → Zod mapping covers
primitives + formats (email/uuid/uri/date-time), enums, arrays,
objects with required/optional keys, `oneOf`/`anyOf` (z.union),
`allOf` (z.intersection), `nullable`, `additionalProperties`
(z.record), and `$ref` resolution against components. Anything not
modeled emits `z.unknown()` with a TODO comment.

**`args` parser** now supports repeated string flags
(`--spec a --spec b`), exposed via the new `getStrings` helper.
Backward compat: `getString` returns the last value when an array
shape comes through.

**Tests.** 21 new vitest tests across the OpenAPI module
(schema-to-zod table, generate.test smoke, multi-spec isolation), the
`from-zod` template scaffold, and the args parser. `pnpm test` passes
in CI; lint clean.
