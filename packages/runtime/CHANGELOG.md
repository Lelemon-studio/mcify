# @mcify/runtime

## 1.0.0-alpha.3

### Minor Changes

- [`5b0c2fc`](https://github.com/Lelemon-studio/mcify/commit/5b0c2fc36650f19b7c598a1b880e6033e12d8aa4) Thanks [@kmilo93sd](https://github.com/kmilo93sd)! - Inspector "slice 2" — SSE notifications channel, persistent settings,
  Playwright E2E coverage.

  **SSE alternative to the WS feed (`@mcify/runtime`).** The inspector
  server now exposes `GET /api/notifications` returning
  `text/event-stream`. Same payload as the `/events` WS feed, mirrored as
  SSE for environments where WebSocket is awkward (corporate proxies,
  some edge runtimes, `curl` debugging). Sends a `config:loaded` hello
  frame on connect, then every runtime event verbatim. Includes a 15s
  heartbeat (`: ping`) so intermediaries don't idle-close. WS remains
  the primary channel — SSE is just a fallback.

  **Persistent settings (`@mcify/inspector`).** Theme (auto/light/dark)
  and log retention (max calls, max events) now persist in
  `localStorage` under `mcify-inspector:settings`. Cross-tab sync via
  the `storage` event. Light theme variables added to the global stylesheet
  so the inspector is readable on any background. Settings tab gained
  controls + a "Reset to defaults" button. The retention thresholds also
  trim the in-memory ring buffer immediately when lowered.

  **Playwright E2E.** New `pnpm --filter @mcify/inspector test:e2e`
  target boots `mcify dev` against an in-package fixture
  (`e2e/fixtures/test.config.ts`) and exercises the tools list, the
  playground (success + failure paths), the calls log, persistent
  settings (including a reload) and the SSE endpoint headers. The
  workflow runs on every CI build. Trace artifacts uploaded on failure.

## 1.0.0-alpha.2

### Minor Changes

- [`a5c698e`](https://github.com/Lelemon-studio/mcify/commit/a5c698e17c221c31b82ed0662addd4edcf4496db) Thanks [@kmilo93sd](https://github.com/kmilo93sd)! - Tool middlewares + in-memory test client.

  Two DX additions that close common gaps before Phase C ships real connectors.

  Tool middlewares (`@mcify/core/middleware`)
  - New `ToolMiddleware` type. Middlewares wrap a handler — declaration order,
    call `next()` to pass control. Patterns: short-circuit (don't call next),
    decorate (transform result), or override input (`next(modified)`).
  - `defineTool({ middlewares: [...] })` runs them after input validation
    and before output validation. The composed chain replaces the raw
    handler in `tool.handler` and `tool.invoke`.
  - `composeMiddlewares()` exported for library authors building higher-level
    abstractions.
  - Built-in middlewares:
    - `requireAuth({ predicate?, message? })` — reject when `ctx.auth.type`
      is `'none'` (default) or a custom predicate fails.
    - `rateLimit({ max, windowMs, keyBy?, message? })` — token-bucket per
      auth key (bearer token / api_key / oauth token by default). In-memory;
      documented limitation for Workers and clusters.
    - `withTimeout({ ms, message? })` — `Promise.race` against a deadline.
  - 13 tests covering ordering, short-circuit, input override, double-`next()`
    detection, identity-shortcut for empty middleware lists, and each built-in.

  In-memory test client (`@mcify/runtime/test`)
  - `createTestClient(config, { auth?, logger? })` returns a client with
    `invokeTool(name, args)`, `readResource(uri)`, `getPrompt(name, args)`
    and a `withAuth(state)` helper.
  - Calls go through the same `dispatch()` path production HTTP traffic uses,
    so tests assert on real behavior — no mocks of the protocol.
  - Tool results are JSON-parsed back to the user-visible shape from the wire
    text content.
  - 11 tests covering the happy path, validation errors, handler throws,
    not-found, auth forwarding, and resource/prompt round trips.

  Total monorepo: 152 tests passing (was 129).

  Why these two together: middlewares give devs the composable extension
  point production-grade libs ship with (rate limit, idempotency, audit,
  auth gates), and the test client makes asserting on those behaviors
  trivial without booting a server. Both are pure additions; no breaking
  changes to existing code.

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

- [`cf59f38`](https://github.com/Lelemon-studio/mcify/commit/cf59f38ff62b338c1be01f5f00a86696fe0a80ab) Thanks [@kmilo93sd](https://github.com/kmilo93sd)! - Test client now accepts a `fetch` option to inject mocks via `ctx.fetch`,
  making it trivial to test tools that hit external APIs without
  monkey-patching globals.

  ```ts
  const client = createTestClient(config, {
    auth: { type: 'bearer', token: 't' },
    fetch: vi.fn().mockResolvedValue(new Response('{...}')),
  });
  ```

- Updated dependencies [[`a5c698e`](https://github.com/Lelemon-studio/mcify/commit/a5c698e17c221c31b82ed0662addd4edcf4496db)]:
  - @mcify/core@1.0.0-alpha.2

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
