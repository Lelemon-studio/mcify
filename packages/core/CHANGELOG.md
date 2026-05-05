# @mcify/core

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
