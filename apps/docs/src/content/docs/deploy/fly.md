---
title: Deploy to Fly.io
description: Deploy your mcify server to Fly.io. Long-running Node, region pinning, default scl.
---

## TL;DR

```bash
# One-time: install flyctl + log in
curl -L https://fly.io/install.sh | sh
flyctl auth login

# First time on a new app
mcify deploy fly --launch

# Every deploy after that
mcify deploy fly
```

The CLI bundles your config for Node, generates `Dockerfile.mcify` +
`fly.toml`, then runs `flyctl deploy`. Result is a Fly app at
`https://<app>.fly.dev/mcp`, scaling on demand.

## Prerequisites

- A Fly.io account.
- `flyctl` (or `fly`) on PATH. mcify accepts either name.
- `flyctl auth login` once.

## Command

```bash
mcify deploy fly [options]
```

| Flag              | Default             | What it does                                                   |
| ----------------- | ------------------- | -------------------------------------------------------------- |
| `--config <path>` | `./mcify.config.ts` | Path to your mcify config.                                     |
| `--app <name>`    | `config.name`       | Fly app name.                                                  |
| `--region <code>` | `scl` (Santiago)    | Primary region — change to `iad`, `cdg`, `nrt`, etc.           |
| `--port <n>`      | `8888`              | Internal port the app listens on.                              |
| `--launch`        | off                 | Run `flyctl launch` (first-time setup) instead of deploy.      |
| `--dry-run`       | off                 | Generate Dockerfile + fly.toml + bundle, skip `flyctl deploy`. |

## What gets generated

```
.
├── Dockerfile.mcify   # multi-stage Alpine, non-root, prod deps only
├── fly.toml           # app, primary_region, http_service, vm sizing
└── dist/              # compiled Node bundle (entry referenced by Dockerfile)
```

If either file already exists it is **left untouched** — your edits
(custom build args, extra processes, autoscaling tweaks) survive.

## Default `fly.toml` settings

| Setting                | Default  | Why                                                                                   |
| ---------------------- | -------- | ------------------------------------------------------------------------------------- |
| `primary_region`       | `scl`    | Santiago — closest to Lelemon and most LATAM users. Override per project.             |
| `auto_stop_machines`   | `stop`   | Scale to zero when idle, costs ~nothing.                                              |
| `min_machines_running` | `0`      | Same — pure on-demand.                                                                |
| `[[vm]]` cpu           | shared 1 | Smallest tier. Bump to `dedicated` if you need predictable latency.                   |
| `memory_mb`            | 256      | Enough for the runtime + Hono + your handlers. Bump if your tools hold lots of state. |

## Setting secrets

```bash
flyctl secrets set MCIFY_AUTH_TOKEN=...
flyctl secrets set KHIPU_API_KEY=...
```

Secrets are encrypted, mounted as env vars, and trigger a redeploy
when changed.

## First-time vs subsequent deploys

The first time on a new app you need `flyctl launch` to create the
app, attach a VM, and pick a region. mcify wraps that:

```bash
mcify deploy fly --launch
```

This calls `flyctl launch --copy-config --no-deploy` so the generated
`fly.toml` is honored and no traffic flows yet. After that:

```bash
mcify deploy fly
```

is the normal redeploy.

## Custom regions

Override the default `scl`:

```bash
mcify deploy fly --launch --region iad   # us-east
mcify deploy fly --launch --region cdg   # paris
```

After the first launch, region edits go directly in `fly.toml`. Add
secondary regions:

```toml
[[vm]]
  cpus = 1
  memory_mb = 256
  region = "iad"
```

Then `flyctl deploy`.

## CI/CD

Drop-in workflow:
[.github/workflows-templates/deploy-fly.yml](https://github.com/Lelemon-studio/mcify/blob/main/.github/workflows-templates/deploy-fly.yml)

Required repo secret:

- `FLY_API_TOKEN` — get one with `flyctl auth token`.

## Troubleshooting

**`Error: app not found`** — first-time setup wasn't run. Use
`--launch`.

**`Error: not authorized`** — `flyctl auth login`, or set
`FLY_API_TOKEN` if you're scripting.

**App boots, then exits with code 0** — you probably forgot to bind
to `0.0.0.0:$PORT`. The runtime does this for you with
`serveNode({ port })`, but if you wrote a custom entry, double-check.

**Heavy bundle** — Fly has no hard size cap; bigger images take
longer to pull. The default Dockerfile uses Alpine + multi-stage so
final images are typically <100 MB.

**Cold starts** — `auto_stop_machines = "stop"` saves money but the
first request after idle takes ~1s. Set
`min_machines_running = 1` to keep one warm.
