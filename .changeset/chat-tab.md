---
'@mcify/inspector': minor
---

Chat tab in the inspector — closes Phase B.

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
