---
'@mcify/cli': minor
'@mcify/core': minor
'@mcify/runtime': minor
---

Initial alpha release.

`@mcify/core`, `@mcify/runtime`, and `@mcify/cli` ship the first usable
slice of the platform:

- `defineTool`, `defineResource`, `definePrompt`, `defineConfig` with
  end-to-end Zod typing and JSON Schema 7 emission.
- Auth helpers (`bearer`, `apiKey`, `oauth`, `auth.none`) with
  constant-time token verification on the runtime side.
- MCP server runtime over stdio (via `@modelcontextprotocol/sdk`) and
  HTTP (Hono-based custom dispatch). Adapters for Node, Bun, and
  Cloudflare Workers.
- `mcify init|dev|build|generate` CLI with the `from-scratch` template.
- Pino logger adapter, opt-in (`createPinoLogger`).

Status: alpha. Stable APIs not promised yet.
