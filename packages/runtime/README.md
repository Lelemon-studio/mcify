# @mcify/runtime

MCP server runtime for mcify. Built on Hono. Runs on Node, Bun, Cloudflare Workers, Deno, and Docker.

> **Status:** scaffold. Hono-based runtime and transport adapters arrive in Phase A.4.

## Install

```bash
npm install @mcify/runtime
```

## Targets

| Target | Adapter | Phase |
|---|---|---|
| Node | `@mcify/runtime/node` | A.4 |
| Bun | `@mcify/runtime/bun` | A.4 |
| Cloudflare Workers | `@mcify/runtime/cloudflare-workers` | D.1 |
| Fly.io | `@mcify/runtime/fly` | D.2 |
| Railway | `@mcify/runtime/railway` | D.3 |
| Docker | (multi-arch image) | D.4 |

## License

Apache 2.0.
