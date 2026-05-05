---
'@mcify/core': minor
'@mcify/runtime': minor
---

Tool middlewares + in-memory test client.

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
