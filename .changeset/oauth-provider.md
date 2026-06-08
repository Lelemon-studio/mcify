---
'@mcify/core': minor
---

Add `oauthProvider()` — mcify can now be its own **OAuth 2.1 authorization server**.

This is the "Connect Claude" experience: an agent discovers the server from a `401`,
registers via Dynamic Client Registration, the user approves in the browser, and the agent
receives a token — no copy-pasted API keys.

`@mcify/core` now ships the authorization-server core: `OAuthServer` (DCR with idempotent
dedup, authorization-code + PKCE S256, refresh rotation with theft detection, token
verification), a pluggable `OAuthStore` with a `MemoryOAuthStore` for dev/tests, and the
`oauthProvider({ store, authorize, issuer? })` config factory. The host plugs in persistence
(`OAuthStore`) and an `authorize(request)` identity/consent hook; the authenticated `subject`
is opaque to mcify and surfaces on `ctx.auth.subject`.

All crypto runs on **Web Crypto** (no `node:crypto`) so the authorization server works
unchanged on Node, Bun, and Cloudflare Workers. The HTTP wiring (well-known metadata,
`/register`, `/authorize`, `/token`, and `401 + WWW-Authenticate`) lands next in
`@mcify/runtime`.
