# Deploying mcify

mcify ships with one CLI command per supported target. Pick the one that
matches your infra and follow its dedicated guide:

| Target                 | Command                       | When to use it                                                                             | Guide                                            |
| ---------------------- | ----------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| **Cloudflare Workers** | `mcify deploy cloudflare`     | Edge runtime, scale-to-zero, lowest cold start, free tier covers most hobby projects.      | [cloudflare-workers.md](./cloudflare-workers.md) |
| **Vercel Edge**        | `mcify deploy vercel`         | Already on Vercel, want preview deploys per branch, need their dashboard.                  | [vercel.md](./vercel.md)                         |
| **Fly.io**             | `mcify deploy fly`            | Want a real long-running Node process, region pinning (default `scl`), regular containers. | [fly.md](./fly.md)                               |
| **Railway**            | `mcify deploy railway`        | Don't want to touch a Dockerfile, prefer a hosted Nixpacks build, just push and go.        | [railway.md](./railway.md)                       |
| **Docker**             | `mcify deploy docker`         | Self-host on a VPS, ECS, Cloud Run, or you want the image to push to GHCR/ECR yourself.    | [docker.md](./docker.md)                         |
| **Kubernetes (Helm)**  | `helm install ./charts/mcify` | Already running K8s — pair with `mcify deploy docker` to build the image.                  | [kubernetes.md](./kubernetes.md)                 |

## Common flow

Every target follows the same three-step shape:

1. **Build** — the CLI calls `buildServer({ target })` for the right
   runtime (Workers, Node, etc.).
2. **Generate config** — the CLI writes the target's deploy contract
   (`wrangler.toml`, `fly.toml`, `railway.json`, `vercel.json`,
   `Dockerfile.mcify`). If the file already exists it is **left
   untouched** — your edits are safe.
3. **Invoke the target's CLI** — `wrangler deploy`, `flyctl deploy`,
   `railway up`, `vercel deploy`, `docker build`. mcify shells out; it
   does not re-implement the API.

## Authentication

mcify never stores secrets for you. Each target has its own credential
mechanism (env var, login command, CI secret). The per-target guide
calls out exactly which ones you need.

For the runtime's own auth (`MCIFY_AUTH_TOKEN` for bearer, or whatever
your `auth` config requires), set it on the target as a normal env var
or secret. The runtime reads it at boot.

## Dry-run

Every command supports `--dry-run`:

```bash
mcify deploy cloudflare --dry-run
mcify deploy fly --dry-run
mcify deploy railway --dry-run
mcify deploy docker --dry-run
```

This generates the config and bundle without invoking the target's CLI
— useful for inspecting what mcify would push, or seeding the deploy
contract once and editing it before the first real deploy.

## CI/CD

There is one drop-in GitHub Actions workflow per target at
[`.github/workflows-templates/`](https://github.com/Lelemon-studio/mcify/tree/main/.github/workflows-templates).
Copy whichever file you need into your project's `.github/workflows/`
and add the secrets the file's header lists.

## Choosing between targets

If you don't know which one to pick:

- **Just want it running, free, fast** → Cloudflare Workers.
- **Need WebSocket / long-lived connections** → Fly or Railway.
- **Already on Vercel** → Vercel.
- **Already on K8s** → Docker → GHCR + Helm chart.
- **Self-host on a single VPS** → Docker.

Every target serves the same `POST /mcp` endpoint so MCP clients
(Claude Desktop, ChatGPT, Lelemon Agentes, your own) don't care which
one you chose.
