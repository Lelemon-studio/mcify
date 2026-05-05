# mcify deploy — GitHub Actions workflow templates

Drop-in CI templates that auto-deploy your MCP server on every push to `main`. Copy the one you want into `.github/workflows/` of _your_ project (not this repo) and set the secrets it needs.

| Target                | File                                               | Required secrets                                     |
| --------------------- | -------------------------------------------------- | ---------------------------------------------------- |
| Cloudflare Workers    | [`deploy-cloudflare.yml`](./deploy-cloudflare.yml) | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`      |
| Vercel Edge           | [`deploy-vercel.yml`](./deploy-vercel.yml)         | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` |
| Fly.io                | [`deploy-fly.yml`](./deploy-fly.yml)               | `FLY_API_TOKEN`                                      |
| Railway               | [`deploy-railway.yml`](./deploy-railway.yml)       | `RAILWAY_TOKEN`                                      |
| Docker (push to GHCR) | [`deploy-docker.yml`](./deploy-docker.yml)         | none (uses `GITHUB_TOKEN`)                           |

## How to install

```bash
# In your mcify project (not this repo):
mkdir -p .github/workflows
curl -L https://raw.githubusercontent.com/Lelemon-studio/mcify/main/.github/workflows-templates/deploy-cloudflare.yml \
  -o .github/workflows/deploy.yml
```

Then add the secrets in your repo settings → Settings → Secrets and variables → Actions.

## What each template does

All five share the same shape:

1. Trigger on push to `main` and on manual `workflow_dispatch`.
2. Set up pnpm + Node 20 + cache.
3. `pnpm install --frozen-lockfile`.
4. (Optional) `pnpm test` to gate the deploy on green tests.
5. `mcify deploy <target>` which generates the right config + bundle and ships it.

The template uses `mcify deploy` rather than the underlying CLI of each provider, so the same workflow keeps working even if Cloudflare/Vercel/Fly change their CLI flags.

## Customizing

Set `MCIFY_AUTH_TOKEN` and any upstream API keys (e.g. `KHIPU_API_KEY`) as repo secrets, then surface them through the platform's secret store before deploy:

- Cloudflare: `wrangler secret put MCIFY_AUTH_TOKEN`
- Vercel: dashboard → Settings → Environment Variables
- Fly: `flyctl secrets set MCIFY_AUTH_TOKEN=...`
- Railway: `railway variables set MCIFY_AUTH_TOKEN=...`

The deploy workflow itself doesn't need them — the _running pod_ does.
