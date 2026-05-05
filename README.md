# mcify

> AI-ready your software in minutes. Convierte tu API en MCP en minutos.

Open source platform to expose any API as a Model Context Protocol (MCP) server. CLI-first, local-first, dev-friendly. Built in TypeScript on Hono and Bun, deployable anywhere.

**Status:** `alpha` — public scaffold. Not functional yet. Track progress in the [roadmap](#roadmap).

---

## Why mcify

- **CLI-first DX.** `npx @mcify/cli init` to a working MCP server in under 60 seconds. Hot reload included.
- **Built-in inspector.** Local web dashboard at `:3001` with tool playground and live call log. No cloud required.
- **Two paths.** Code-first TypeScript with type-safe Zod schemas, or config-first YAML. Both compile to the same runtime.
- **Multi-target deploy.** One command to ship to Cloudflare Workers, Fly.io, Railway, Docker, or your own Kubernetes.
- **Self-host gratis.** Apache 2.0. Run it offline, in your VPC, on your laptop. Zero vendor lock-in.
- **LATAM-first.** Spanish-language docs, Chilean connector examples (Khipu, Bsale, Fintoc), and local support.

## Quick start

```bash
# Try without installing
npx @mcify/cli init my-mcp
cd my-mcp
mcify dev

# Or install globally
npm install -g @mcify/cli
mcify init my-mcp
```

Open `http://localhost:3001` for the inspector. Connect your MCP client (Claude Desktop, Cursor, Claude Code, custom agents) to `http://localhost:8888/mcp`.

> Coming in V1 (June 2026). Subscribe to the repo to get the launch.

## Packages

| Package | Description |
|---|---|
| `@mcify/cli` | Command-line tool: `init`, `dev`, `build`, `deploy`, `generate`. |
| `@mcify/core` | Builder library: `defineTool`, `defineResource`, schema helpers, auth. |
| `@mcify/runtime` | MCP server runtime (Hono-based) with multi-target adapters. |
| `@mcify/inspector` | Local dashboard web app. |

## Roadmap

| Phase | Status | What it ships |
|---|---|---|
| A. Core lib + CLI | In progress | `init`, `dev`, `build` working end-to-end with hot reload. |
| B. Inspector | Pending | Local web dashboard with tools, call log, playground. |
| C. Examples (dogfood) | Pending | Khipu, Bsale, Fintoc connectors used in production by Lelemon Agents. |
| D. Deploy targets | Pending | One-command deploy to Workers, Fly, Railway, Docker, K8s. |
| E. mcify Cloud | V2 | Multi-tenant hosting at `mcify.cloud` (closed source). |
| F. Marketplace | V2 | Shared registry of community MCPs at `mcify.dev/registry`. |

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup and guidelines. By participating, you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Security

To report a vulnerability, please follow the process in [SECURITY.md](./SECURITY.md). Do not open public issues for security concerns.

## License

Apache 2.0. See [LICENSE](./LICENSE).

Maintained by [Lelemon Studio](https://lelemon.cl).
