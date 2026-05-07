# @mcify/cli

## 1.0.0-alpha.3

### Minor Changes

- [`7128062`](https://github.com/Lelemon-studio/mcify/commit/7128062b6d0d792913d699c32a2fd811c8976592) Thanks [@kmilo93sd](https://github.com/kmilo93sd)! - `mcify deploy fly` and `mcify deploy railway` (Phase D slice 2) plus a
  production-ready Helm chart at `charts/mcify/`.

  **Fly.io** — `mcify deploy fly [--app n] [--region scl] [--launch] [--port 8888]`
  generates `Dockerfile.mcify` (skipped if you have one) and `fly.toml`
  (skipped if you have one), then runs `flyctl deploy`. Pass `--launch`
  the first time to run `flyctl launch` instead. Region defaults to `scl`
  (Santiago) for Lelemon use; override per project.

  **Railway** — `mcify deploy railway [--service n] [--environment production] [--port 8888]`
  generates `railway.json` with a Nixpacks plan pinning Node 20 + pnpm 9,
  a healthcheck on `/`, and the start command. Then runs `railway up`.

  Both targets reuse the existing `buildServer({ target: 'node' })` for
  the bundle and surface the right install hint when their CLI is
  missing (`flyctl`, `railway`).

  **Helm chart** (`charts/mcify/`) — Kubernetes deploy without the CLI:

  ```bash
  helm install my-mcp ./charts/mcify \
    --set image.repository=ghcr.io/your-org/your-mcp \
    --set image.tag=v1 \
    --set secret.existing=my-mcp-secrets
  ```

  Includes Deployment (with non-root securityContext, drop ALL caps,
  read-only root + `/tmp` emptyDir), Service, optional Ingress with TLS,
  ServiceAccount, optional HPA (autoscaling/v2), and a dev-only Secret
  (production should use `secret.existing` referencing an externally
  managed Secret). Probes hit the runtime's `GET /` health endpoint
  (supplied by `createHttpApp`).

  Compatibility: Kubernetes ≥ 1.27, Helm 3.

  Smoke-tested both deploy targets in `--dry-run` mode against the
  example-khipu config — generated configs verified manually.

- [`9bad055`](https://github.com/Lelemon-studio/mcify/commit/9bad05554a12d9e3d00f69d1fbc5deb38c0f5865) Thanks [@kmilo93sd](https://github.com/kmilo93sd)! - Two new ways to bootstrap an mcify project — closes Phase C.4.

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

### Patch Changes

- [`b5dfd71`](https://github.com/Lelemon-studio/mcify/commit/b5dfd71021446bca7d0406c6d7b697d7558c688c) Thanks [@kmilo93sd](https://github.com/kmilo93sd)! - Drop-in GitHub Actions workflow templates at `.github/workflows-templates/`
  covering all five `mcify deploy` targets: Cloudflare Workers, Vercel Edge,
  Fly.io, Railway, and Docker (build + push to GHCR).

  Each file is a complete `on: push: branches: [main]` job that runs
  `pnpm install`, `pnpm test --if-present`, and the corresponding
  `mcify deploy <target>` (or `docker/build-push-action` for the Docker
  flow). Concurrency groups are scoped per-target so two deploys on the
  same target queue up instead of racing.

  Users copy the file they need into `.github/workflows/` of their own
  project. The templates' README documents the secrets each one expects
  (`CLOUDFLARE_API_TOKEN`, `VERCEL_TOKEN`, `FLY_API_TOKEN`, `RAILWAY_TOKEN`,
  or just `GITHUB_TOKEN` for Docker → GHCR).

  The Docker template generates `Dockerfile.mcify` via `mcify deploy docker
--dry-run` and then builds a multi-arch (`linux/amd64`, `linux/arm64`)
  image with `docker/build-push-action@v6` + Buildx + GHA layer cache.

- [`575e5f4`](https://github.com/Lelemon-studio/mcify/commit/575e5f4b69f0da258ab9c73095a828cdb94a60e8) Thanks [@kmilo93sd](https://github.com/kmilo93sd)! - Per-target deploy guides at [`docs/deploy/`](https://github.com/Lelemon-studio/mcify/tree/main/docs/deploy)
  — closes Phase D.

  One markdown per target (cloudflare-workers, vercel, fly, railway,
  docker, kubernetes) plus an index README. Each guide covers:
  - TL;DR copy-paste flow.
  - Prerequisites (CLI tools, login, account requirements).
  - The `mcify deploy <target>` command and its flags.
  - What gets generated (and what stays untouched on rerun).
  - Setting secrets the way that target expects.
  - Bundle size limits where they apply (Workers 1/10 MB, Vercel 4 MB).
  - The matching `.github/workflows-templates/` workflow + required
    repo secrets.
  - Common errors and how to fix them.

  The Helm chart at `charts/mcify/` keeps its own `README.md` for the
  chart-specific values reference; `docs/deploy/kubernetes.md` covers
  the install flow + the docker → registry → Helm pipeline.

  README.md gains a links block under "Deploy" pointing at each guide.

- Updated dependencies [[`4429185`](https://github.com/Lelemon-studio/mcify/commit/4429185040b625dc6334cbfa799aee0d2213c984), [`5b0c2fc`](https://github.com/Lelemon-studio/mcify/commit/5b0c2fc36650f19b7c598a1b880e6033e12d8aa4)]:
  - @mcify/inspector@0.1.0-alpha.3
  - @mcify/runtime@1.0.0-alpha.3

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
