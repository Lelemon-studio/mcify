---
'@mcify/runtime': minor
---

Serve the OAuth 2.1 endpoints when `auth: oauthProvider(...)` is configured.

The runtime now mounts the discovery + OAuth endpoints alongside the MCP route:
`/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`,
`/register` (DCR), `/authorize` (with the host consent round-trip), and `/token`. The MCP
route answers `401 + WWW-Authenticate(resource_metadata)` so an agent bootstraps the whole
flow from one 401, and a valid token resolves to `ctx.auth = { type: 'oauth_provider', subject, … }`.
