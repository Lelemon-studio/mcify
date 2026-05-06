# Deploy to Railway

## TL;DR

```bash
# One-time: install + log in
npm i -g @railway/cli
railway login
railway link    # pick or create the project + service

# Every deploy
mcify deploy railway
```

The CLI bundles your config for Node, generates `railway.json` with a
Nixpacks plan (Node 20 + pnpm 9), then runs `railway up`. Railway
builds + deploys the service.

## Prerequisites

- A Railway account.
- `railway` CLI on PATH (`npm i -g @railway/cli`).
- `railway login` once.
- The project linked once: `railway link`.

## Command

```bash
mcify deploy railway [options]
```

| Flag                  | Default             | What it does                                         |
| --------------------- | ------------------- | ---------------------------------------------------- |
| `--config <path>`     | `./mcify.config.ts` | Path to your mcify config.                           |
| `--service <name>`    | last linked         | Specific service inside the project.                 |
| `--environment <env>` | `production`        | Target environment.                                  |
| `--port <n>`          | `8888`              | App port (passed as `PORT` env var).                 |
| `--dry-run`           | off                 | Generate `railway.json` + bundle, skip `railway up`. |

## What gets generated

```
.
├── railway.json       # Nixpacks plan, start command, healthcheck on /
└── dist/              # compiled Node bundle (referenced by railway.json)
```

If `railway.json` already exists it is **left untouched** — your
edits stick.

## Default `railway.json`

```json
{
  "build": {
    "builder": "NIXPACKS",
    "nixpacksPlan": {
      "phases": {
        "setup": { "nixPkgs": ["nodejs_20", "pnpm-9_x"] }
      }
    }
  },
  "deploy": {
    "startCommand": "node dist/your-entry.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3,
    "healthcheckPath": "/",
    "healthcheckTimeout": 30
  }
}
```

The healthcheck hits `GET /` — the runtime's built-in health endpoint.
If you mount the MCP under a custom prefix and `/` is no longer
served, point the healthcheck somewhere that returns 200.

## Setting secrets

```bash
railway variables set MCIFY_AUTH_TOKEN=...
railway variables set KHIPU_API_KEY=...
```

Or use the Railway dashboard. Variables are scoped per environment
(production / preview / etc.).

## CI/CD

Drop-in workflow:
[.github/workflows-templates/deploy-railway.yml](https://github.com/Lelemon-studio/mcify/blob/main/.github/workflows-templates/deploy-railway.yml)

Required repo secret:

- `RAILWAY_TOKEN` — generate from Railway → Account Settings → Tokens.

## Troubleshooting

**`Error: not logged in`** — run `railway login` (or set
`RAILWAY_TOKEN` if scripting).

**`Error: no service linked`** — run `railway link` once in the
project directory. If you have multiple services, pass `--service
<name>` to `mcify deploy railway`.

**Build fails on missing pnpm** — the generated Nixpacks plan pins
`pnpm-9_x`. If your repo uses npm or yarn, edit `railway.json` to
swap the `nixPkgs` and the start command.

**Healthcheck failing** — Railway considers the service down if
`GET /` doesn't return 200 within 30s. Check `railway logs` for
boot errors (usually a missing env var).

**No public URL** — Railway services are private by default. Click
"Generate Domain" in the dashboard, or `railway domain` from the CLI.
