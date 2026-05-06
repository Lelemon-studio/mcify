---
'@mcify/runtime': minor
'@mcify/inspector': minor
---

Inspector "slice 2" — SSE notifications channel, persistent settings,
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
