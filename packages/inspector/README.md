# @mcify/inspector

Local web inspector for `mcify dev`. Single-page app served by the runtime when `mcify dev` runs — tabs for **Tools**, **Calls Log**, **Playground**, and **Settings**.

> Status: alpha. Iterates fast. Bundled with the CLI; you don't normally install this directly.

## Architecture

- **Astro** for the static shell.
- **React islands** for the interactive panels (`client:only="react"`).
- WebSocket to `/events` (served by `@mcify/runtime/inspector`) for live tool/resource/prompt telemetry.
- HTTP `/api/*` for config snapshots and tool invocations.

## Develop

```bash
# Terminal 1 — run the example MCP server with the inspector backend.
cd packages/cli/templates/from-scratch  # or any mcify project
pnpm install
pnpm dev   # serves on :8888 (MCP) and :3001 (inspector backend)

# Terminal 2 — run Astro dev server with HMR for the inspector UI.
cd packages/inspector
pnpm dev   # http://localhost:5174 — proxies /api and /events to :3001
```

## Build

```bash
pnpm build   # outputs static files to dist/
```

The runtime serves `dist/` from the inspector port (default `:3001`).

## License

Apache 2.0.
