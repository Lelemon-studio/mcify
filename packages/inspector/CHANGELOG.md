# @mcify/inspector

## 0.1.0-alpha.3

### Minor Changes

- [`4429185`](https://github.com/Lelemon-studio/mcify/commit/4429185040b625dc6334cbfa799aee0d2213c984) Thanks [@kmilo93sd](https://github.com/kmilo93sd)! - Chat tab in the inspector — closes Phase B.

  A new "Chat" tab lets you talk to the MCP server through a real LLM,
  straight from the browser.

  **Provider-agnostic.** Two providers wired up: **Anthropic** (Claude
  Sonnet 4.6, Opus 4.7, Haiku 4.5) and **OpenAI** (GPT-4o, GPT-4o mini).
  Pick a model from the dropdown, paste your API key, send a message —
  the inspector routes the request directly from the browser to the
  provider, never through the inspector server.

  **API key stays in memory.** The key lives in component state. It is
  **not** persisted (no localStorage, no cookies, no server). Reload the
  page and you start over. The input is `type="password"` and
  `autocomplete="off"`.

  **Real tool calls.** Tools registered in your `mcify.config.ts` are
  forwarded to the model as native tool definitions (Anthropic
  `input_schema`, OpenAI `function.parameters`). When the model emits a
  `tool_use`, the inspector dispatches it to the runtime via
  `POST /api/tools/<name>/invoke` (same path the Playground uses), feeds
  the result back as a `tool_result`, and loops until the model replies
  without further tool calls (capped at 5 iterations to prevent runaway
  loops). Errors from tools surface as `tool_error` blocks; the model
  sees them and can recover.

  **Cancellable.** A "Stop" button aborts the in-flight provider request
  and any pending tool dispatches.

  **E2E.** A new Playwright spec covers: model picker visible, API key
  input is `type=password`, send-without-key surfaces an inline error,
  and reload doesn't leak the key into localStorage.

  CSS: light/dark themes both supported via the existing variable system.

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

### Patch Changes

- Updated dependencies [[`5b0c2fc`](https://github.com/Lelemon-studio/mcify/commit/5b0c2fc36650f19b7c598a1b880e6033e12d8aa4)]:
  - @mcify/runtime@1.0.0-alpha.3

## 0.1.0-alpha.2

### Minor Changes

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
  - @mcify/runtime@1.0.0-alpha.2
