# mcify.io → mcify.dev redirect Worker

A Cloudflare Worker that 301-redirects every `mcify.io` and `www.mcify.io` request to the same path on `mcify.dev`. Apex + subdomain + querystring preserved.

We registered both `mcify.io` (backup) and `mcify.dev` (canonical) at Cloudflare Registrar. To avoid SEO duplicate-content and keep a single canonical site, all `mcify.io` traffic is redirected at the edge.

## Why a Worker and not Page Rules / Single Redirects

The granular Cloudflare API token we use for automation has Workers and DNS scopes, but not Rulesets / Page Rules — both of those would be cleaner but require a different token. The Worker is 5 lines and runs on the same edge, so the trade-off is fine.

## Deploy

```bash
# From this directory:
npx wrangler deploy

# Or from the repo root:
pnpm --filter mcify-web exec wrangler deploy --config infra/mcify-io-redirect/wrangler.toml
```

Routes are declared in `wrangler.toml`; `wrangler deploy` updates them in place.

## Verify

```bash
curl -sI https://mcify.io/foo?bar=baz | head -3
# HTTP/1.1 301 Moved Permanently
# Location: https://mcify.dev/foo?bar=baz
```
