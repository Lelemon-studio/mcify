---
title: Deploy overview
description: One CLI command per supported target. Pick the one that matches your infra.
---

import { LinkCard, CardGrid } from '@astrojs/starlight/components';

mcify ships one CLI command per supported target. Pick whichever fits your infra:

| Target             | Command                       | When to use it                                          |
| ------------------ | ----------------------------- | ------------------------------------------------------- |
| Cloudflare Workers | `mcify deploy cloudflare`     | Edge runtime, scale-to-zero, lowest cold start.         |
| Vercel Edge        | `mcify deploy vercel`         | Already on Vercel, want preview deploys per branch.     |
| Fly.io             | `mcify deploy fly`            | Real long-running Node, region pinning (default `scl`). |
| Railway            | `mcify deploy railway`        | Push and go, no Dockerfile to maintain.                 |
| Docker             | `mcify deploy docker`         | Self-host, ECS, Cloud Run, push to GHCR/ECR.            |
| Kubernetes         | `helm install ./charts/mcify` | Already on K8s — pair with `mcify deploy docker`.       |

## The shape of every deploy

Every target follows the same three-step flow:

1. **Build** — `buildServer({ target })` for the right runtime (Workers, Node, etc.).
2. **Generate config** — `wrangler.toml` / `fly.toml` / `railway.json` / `vercel.json` / `Dockerfile.mcify`. If the file already exists it's left alone — your edits survive.
3. **Invoke the target's CLI** — `wrangler deploy`, `flyctl deploy`, `railway up`, `vercel deploy`, `docker build`. mcify shells out; it doesn't re-implement the API.

Every command supports `--dry-run` so you can inspect what would be pushed without actually pushing.

## Per-target guides

<CardGrid>
  <LinkCard title="Cloudflare Workers" href="/deploy/cloudflare/" />
  <LinkCard title="Vercel Edge" href="/deploy/vercel/" />
  <LinkCard title="Fly.io" href="/deploy/fly/" />
  <LinkCard title="Railway" href="/deploy/railway/" />
  <LinkCard title="Docker" href="/deploy/docker/" />
  <LinkCard title="Kubernetes (Helm)" href="/deploy/kubernetes/" />
</CardGrid>

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
