---
'@mcify/cli': minor
---

`mcify deploy <target>` for Cloudflare Workers, Vercel Edge, and Docker.

```bash
mcify deploy cloudflare [--project-name n] [--account-id id]
mcify deploy vercel     [--prod] [--project n]
mcify deploy docker     [--tag image:tag] [--platform linux/amd64,linux/arm64] [--push]
```

All three accept `--config <path>` and `--dry-run` (generate the bundle

- config files but skip the actual deploy command).

**Cloudflare Workers** — bundles your config with esbuild for `workerd`
(target ES2022, browser conditions, all deps inline), generates a
minimal `wrangler.toml` with `nodejs_compat`, and runs
`npx wrangler deploy`. Surfaces a friendly error if the bundle exceeds
1 MB (free tier) or 10 MB (paid).

**Vercel Edge** — same edge-targeted bundle as Workers but exports the
shape Vercel expects (`api/mcp.mjs` with `export const config = { runtime: 'edge' }`).
Generates `vercel.json` only if missing — won't overwrite custom routing.
Runs `npx vercel` (preview) or `npx vercel --prod`.

**Docker** — multi-stage `Dockerfile.mcify` (deps stage detects
`pnpm-lock.yaml` / `yarn.lock` / `package-lock.json`, runtime stage runs
as the non-root `node` user). Calls `mcify build --target node` to
produce `dist/server.mjs`, then `docker build`. Optional `--push` to
push to a registry afterward.

Common DX wins

- Pre-flight binary check (`npx`, `docker`) with install hints.
- Each deploy reports the bundle size up front so users don't waste a
  push on a too-big artifact.
- `--dry-run` for CI smoke tests and reviewing the generated config.

Fly.io and Railway adapters arrive in a follow-up release.
