# @mcify/cli

## 1.0.0-alpha.2

### Minor Changes

- [`f019d17`](https://github.com/Lelemon-studio/mcify/commit/f019d178e66b5a2ba1c06c30ea969ac6abaf86b7) Thanks [@kmilo93sd](https://github.com/kmilo93sd)! - `mcify init` projects are now AI-agent ready out of the box.
  - Added `AGENTS.md` to the `from-scratch` template. Universal contract
    for any AI assistant (Claude Code, Cursor, Cody, Windsurf,
    Copilot Workspace) — covers project layout, the canonical pattern
    for adding tools, schema helpers, auth, the testing approach with
    `createTestClient`, conventions, and anti-patterns specific to mcify
    projects.
  - New template `example-khipu` (try with
    `mcify init my-project --template example-khipu`). Clones the
    reference Khipu connector — `KhipuClient` + two tools
    (`khipu_create_payment`, `khipu_get_payment_status`) wrapped in
    `requireAuth` + `rateLimit` + `withTimeout` middleware — as a
    standalone runnable project. Ships with its own AGENTS.md tuned to
    the connector pattern and a README that walks through env setup,
    wiring to Claude Desktop / Cursor / Lelemon Agentes, and extending.

- [`34547ea`](https://github.com/Lelemon-studio/mcify/commit/34547eacb3bf71ac9c3ce95aacb541ce01017ac9) Thanks [@kmilo93sd](https://github.com/kmilo93sd)! - `mcify deploy <target>` for Cloudflare Workers, Vercel Edge, and Docker.

  ```bash
  mcify deploy cloudflare [--project-name n] [--account-id id]
  mcify deploy vercel     [--prod] [--project n]
  mcify deploy docker     [--tag image:tag] [--platform linux/amd64,linux/arm64] [--push]
  ```

  All three accept `--config <path>` and `--dry-run` (generate the bundle
  - config files but skip the actual deploy command).

  **Cloudflare Workers** — bundles your config with esbuild for `workerd`
  (target ES2022, browser conditions, all deps inline), generates a
  minimal `wrangler.toml` with `nodejs_compat`, and runs
  `npx wrangler deploy`. Surfaces a friendly error if the bundle exceeds
  1 MB (free tier) or 10 MB (paid).

  **Vercel Edge** — same edge-targeted bundle as Workers but exports the
  shape Vercel expects (`api/mcp.mjs` with `export const config = { runtime: 'edge' }`).
  Generates `vercel.json` only if missing — won't overwrite custom routing.
  Runs `npx vercel` (preview) or `npx vercel --prod`.

  **Docker** — multi-stage `Dockerfile.mcify` (deps stage detects
  `pnpm-lock.yaml` / `yarn.lock` / `package-lock.json`, runtime stage runs
  as the non-root `node` user). Calls `mcify build --target node` to
  produce `dist/server.mjs`, then `docker build`. Optional `--push` to
  push to a registry afterward.

  Common DX wins
  - Pre-flight binary check (`npx`, `docker`) with install hints.
  - Each deploy reports the bundle size up front so users don't waste a
    push on a too-big artifact.
  - `--dry-run` for CI smoke tests and reviewing the generated config.

  Fly.io and Railway adapters arrive in a follow-up release.

- [`1c078ba`](https://github.com/Lelemon-studio/mcify/commit/1c078ba1c3b61f5c27371da3c4c7be52d0086678) Thanks [@kmilo93sd](https://github.com/kmilo93sd)! - Local web inspector (Phase B, first slice).

  `mcify dev` now boots the inspector at `http://localhost:3001` alongside the
  MCP server. The inspector ships as a new package, `@mcify/inspector`, and is
  served by the runtime.

  What's in this slice
  - New `@mcify/runtime` event bus for tool/resource/prompt telemetry. The
    HTTP transport emits structured events on every dispatch when a bus is
    present.
  - `@mcify/runtime/inspector` subpath: HTTP API (`/api/server`,
    `/api/tools`, `/api/resources`, `/api/prompts`, `POST /api/tools/:name/invoke`)
    plus a WebSocket at `/events` that streams runtime events live.
  - `@mcify/inspector` package: Astro + React islands. Tabs for **Tools**,
    **Calls Log**, **Playground**, and **Settings**. Dark theme by default,
    zero external UI deps.
  - `mcify dev` flags: `--inspector-port <n>` (default 3001), `--no-inspector`
    to disable.
  - Hot reload: file changes trigger an MCP server restart and a `config:loaded`
    event so the inspector refreshes its tool list without a page reload.

  Coming next
  - SSE notifications for the MCP `GET /mcp` endpoint (currently 405).
  - Playwright E2E smoke test.
  - Persistent inspector settings (theme, log retention, filters).

### Patch Changes

- Updated dependencies [[`a5c698e`](https://github.com/Lelemon-studio/mcify/commit/a5c698e17c221c31b82ed0662addd4edcf4496db), [`cf59f38`](https://github.com/Lelemon-studio/mcify/commit/cf59f38ff62b338c1be01f5f00a86696fe0a80ab), [`1c078ba`](https://github.com/Lelemon-studio/mcify/commit/1c078ba1c3b61f5c27371da3c4c7be52d0086678)]:
  - @mcify/core@1.0.0-alpha.2
  - @mcify/runtime@1.0.0-alpha.2
  - @mcify/inspector@0.1.0-alpha.2

## 0.1.0-alpha.1

### Minor Changes

- [`904ed1c`](https://github.com/Lelemon-studio/mcify/commit/904ed1c5410a3339dd0a942592f18f366345def5) Thanks [@kmilo93sd](https://github.com/kmilo93sd)! - Initial alpha release.

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

### Patch Changes

- Updated dependencies [[`904ed1c`](https://github.com/Lelemon-studio/mcify/commit/904ed1c5410a3339dd0a942592f18f366345def5)]:
  - @mcify/core@0.1.0-alpha.1
  - @mcify/runtime@0.1.0-alpha.1
