---
title: Deploy overview
description: One CLI command per supported target. Pick the one that matches your infra.
---

mcify ships one CLI command per supported target. Pick whichever fits your infra:

| Target             | Command                       | Guide                             |
| ------------------ | ----------------------------- | --------------------------------- |
| Cloudflare Workers | `mcify deploy cloudflare`     | [cloudflare](/deploy/cloudflare/) |
| Vercel Edge        | `mcify deploy vercel`         | [vercel](/deploy/vercel/)         |
| Fly.io             | `mcify deploy fly`            | [fly](/deploy/fly/)               |
| Railway            | `mcify deploy railway`        | [railway](/deploy/railway/)       |
| Docker             | `mcify deploy docker`         | [docker](/deploy/docker/)         |
| Kubernetes         | `helm install ./charts/mcify` | [kubernetes](/deploy/kubernetes/) |

## The shape of every deploy

Every target follows the same three-step flow:

1. **Build** — `buildServer({ target })` for the right runtime (Workers, Node, etc.).
2. **Generate config** — `wrangler.toml` / `fly.toml` / `railway.json` / `vercel.json` / `Dockerfile.mcify`. If the file already exists it's left alone — your edits survive.
3. **Invoke the target's CLI** — `wrangler deploy`, `flyctl deploy`, `railway up`, `vercel deploy`, `docker build`. mcify shells out; it doesn't re-implement the API.

Every command supports `--dry-run` so you can inspect what would be pushed without actually pushing.

## CI/CD

Drop-in workflow templates live at `.github/workflows-templates/` in the repo. Copy whichever target you use into your project's `.github/workflows/` and fill in the secrets each one's header lists.

## Choosing

If you don't know:

- **Just want it running, free, fast** → Cloudflare Workers.
- **Need WebSocket / long-lived connections** → Fly or Railway.
- **Already on Vercel** → Vercel.
- **Already on K8s** → Docker → GHCR + Helm chart.
- **Self-host on a single VPS** → Docker.

Every target serves the same `POST /mcp` endpoint, so MCP clients don't care which one you picked.
