---
title: Deploy to Cloudflare Workers
description: Deploy your mcify server to Cloudflare Workers — edge runtime, scale-to-zero.
---

## TL;DR

```bash
# One-time: log in
npx wrangler login

# Every deploy
mcify deploy cloudflare
```

The CLI bundles your config for the Workers runtime, generates
`dist/cloudflare/wrangler.toml`, then runs `wrangler deploy`. The
result is a worker at `https://<your-name>.<account>.workers.dev/mcp`.

## Prerequisites

- A Cloudflare account.
- Either:
  - `CLOUDFLARE_API_TOKEN` set in your shell, **or**
  - having run `npx wrangler login` once.
- `--account-id <id>` flag, or `CLOUDFLARE_ACCOUNT_ID` env var, if your
  token doesn't have it embedded.

## Command

```bash
mcify deploy cloudflare [options]
```

| Flag                       | Default             | What it does                                                         |
| -------------------------- | ------------------- | -------------------------------------------------------------------- |
| `--config <path>`          | `./mcify.config.ts` | Path to your mcify config.                                           |
| `--project-name <n>`       | `config.name`       | Worker name (also the subdomain).                                    |
| `--account-id <id>`        | from token          | Cloudflare account id, only needed if the token doesn't include it.  |
| `--compatibility-date <d>` | `2026-01-01`        | Workers compatibility date.                                          |
| `--dry-run`                | off                 | Generate `wrangler.toml` and the bundle, but skip `wrangler deploy`. |

## What gets generated

```
dist/cloudflare/
├── wrangler.toml      # name, main, compatibility_date, nodejs_compat
└── worker.js          # bundled runtime + your config
```

If `dist/cloudflare/wrangler.toml` already exists, mcify **does not
overwrite it** — your edits (custom routes, KV bindings, secrets)
survive every redeploy.

## Setting secrets

The runtime reads env vars at boot. On Workers those come from
`wrangler secret`:

```bash
npx wrangler secret put MCIFY_AUTH_TOKEN     # the runtime's bearer token
npx wrangler secret put KHIPU_API_KEY        # whatever your tools need
```

For non-secret config you can put `[vars]` in `wrangler.toml`. Avoid
that for anything sensitive — use `secret put`.

## Bundle size limits

Cloudflare Workers reject bundles larger than:

- **1 MB** on the free tier.
- **10 MB** on the paid plan.

mcify warns you before pushing if you cross 1 MB and errors out at
10 MB. If you hit it, options are:

1. Move heavy deps into runtime imports the bundler can tree-shake.
2. Switch to `mcify deploy fly` or `railway` — both run a real Node
   process with no size cap.

## Custom routes

After your first deploy, edit `wrangler.toml`:

```toml
routes = [
  { pattern = "mcp.example.com/*", zone_name = "example.com" }
]
```

Then `mcify deploy cloudflare` again. mcify won't overwrite the file.

## CI/CD

Drop-in workflow:
[.github/workflows-templates/deploy-cloudflare.yml](https://github.com/Lelemon-studio/mcify/blob/main/.github/workflows-templates/deploy-cloudflare.yml)

Required repo secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## Troubleshooting

**`Authentication error [code: 10000]`** — your `CLOUDFLARE_API_TOKEN`
is missing the right permissions. The token needs at least:
`Account.Workers Scripts:Edit` and `Account.Workers Routes:Edit`.

**`bundle is larger than 1 MB`** — see the bundle size section above.

**Worker boots but `/mcp` returns 500** — check `wrangler tail` while
hitting the endpoint. Usually a missing secret (`MCIFY_AUTH_TOKEN`)
or a tool that imports a Node-only module (use `nodejs_compat` or
swap the dep).

**Cold start feels slow** — Workers cold start is ~1ms; if it feels
slower it's almost always your tool's first outbound call (DNS, TLS
to a third-party API).
