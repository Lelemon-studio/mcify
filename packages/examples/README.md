# Examples

Reference MCP servers built on mcify, focused on Chilean APIs that show up in real LATAM SaaS work. Each one is a standalone server with its own client, tools, tests, and bilingual README.

| Example               | Service                                       | Tools | Status |
| --------------------- | --------------------------------------------- | ----- | ------ |
| [`khipu/`](./khipu)   | Khipu — payment links (Chile)                 | 2     | alpha  |
| [`bsale/`](./bsale)   | Bsale — DTE / facturación electrónica (Chile) | 4     | alpha  |
| [`fintoc/`](./fintoc) | Fintoc — open banking (Chile / Mexico)        | 3     | alpha  |

Each one:

- Has a `client.ts` that wraps the upstream API with a small typed surface (no SDK dependency — keeps the bundle tight).
- Exposes its tools via `defineTool` from `@mcify/core` with `requireAuth` + `rateLimit` + `withTimeout` middleware.
- Ships tests that mock `fetch` against fixed JSON snapshots — no upstream credentials needed in CI.
- Has a bilingual README (`README.md` in English, `README.es.md` in Spanish) plus per-tool descriptions in English so MCP clients render them cleanly across locales.

## Running one

```bash
# Install once at the monorepo root
pnpm install

# Set the env vars its README lists, then:
pnpm --filter @mcify/example-bsale dev   # or example-khipu / example-fintoc
```

The MCP endpoint is at `http://localhost:8888/mcp`. The inspector is at `http://localhost:3001`.

## Using one as a template

These will become bootstrap templates with `mcify init --template example-<name>` in Phase C.4. For now, the simplest approach:

```bash
cp -r packages/examples/khipu my-mcp-server
cd my-mcp-server
# edit package.json, mcify.config.ts, src/ as needed
```

## Adding an example

See [CONTRIBUTING.md](../../CONTRIBUTING.md) at the monorepo root. The bar is:

- Wraps a real public API (no synthetic demos).
- Has a passing test suite that doesn't require live credentials.
- Bilingual README explaining both the upstream API and the auth model.
- Apache 2.0 compatible.

PRs welcome.
