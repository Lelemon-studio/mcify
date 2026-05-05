---
'@mcify/runtime': minor
'@mcify/cli': minor
'@mcify/inspector': minor
---

Local web inspector (Phase B, first slice).

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
