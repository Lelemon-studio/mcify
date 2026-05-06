---
title: Deploy with Docker
description: Build a multi-arch Docker image of your mcify server. Push to GHCR, ECR, or any registry.
---

## TL;DR

```bash
# Build the image
mcify deploy docker --tag your-org/your-mcp:v1

# Build and push
mcify deploy docker --tag ghcr.io/your-org/your-mcp:v1 --push

# Build a multi-arch image (Buildx required)
mcify deploy docker --platform linux/amd64,linux/arm64 \
  --tag ghcr.io/your-org/your-mcp:v1 --push
```

The CLI bundles your config for Node, generates `Dockerfile.mcify`,
then runs `docker build`. With `--push` it also runs `docker push`.

## Prerequisites

- `docker` on PATH (Docker Desktop, Docker Engine, or Buildx).
- For `--push`: registry credentials (`docker login <registry>`).
- For `--platform <list>`: Docker Buildx + QEMU set up.

## Command

```bash
mcify deploy docker [options]
```

| Flag                | Default               | What it does                                                       |
| ------------------- | --------------------- | ------------------------------------------------------------------ |
| `--config <path>`   | `./mcify.config.ts`   | Path to your mcify config.                                         |
| `--tag <image:tag>` | `mcify-server:latest` | Image tag. Use a fully-qualified one (`ghcr.io/...`) when pushing. |
| `--platform <list>` | host arch             | Comma-separated platforms, e.g. `linux/amd64,linux/arm64`.         |
| `--port <n>`        | `8888`                | EXPOSEd port inside the image.                                     |
| `--push`            | off                   | `docker push` after build.                                         |
| `--dry-run`         | off                   | Generate Dockerfile + bundle, skip `docker build`.                 |

## What gets generated

```
.
├── Dockerfile.mcify   # multi-stage Alpine, non-root, prod deps only
└── dist/              # compiled Node bundle (referenced by Dockerfile)
```

If `Dockerfile.mcify` already exists it is **left untouched**. Want a
custom base image, extra apt packages, a healthcheck — edit it once
and every redeploy honors your changes.

## Default image

```dockerfile
FROM node:20-alpine AS deps
# install prod deps from npm/pnpm/yarn lockfile

FROM node:20-alpine
USER node                         # non-root, uid 1000
COPY --from=deps /app/node_modules ./node_modules
COPY <bundle entry> .
ENV NODE_ENV=production PORT=8888
EXPOSE 8888
CMD ["node", "<entry>"]
```

Two stages: deps install, then a clean runtime layer. Final image is
typically <100 MB.

## Multi-arch builds

```bash
mcify deploy docker \
  --platform linux/amd64,linux/arm64 \
  --tag ghcr.io/you/your-mcp:v1 \
  --push
```

Requires Buildx — Docker Desktop ships it; on Linux:

```bash
docker buildx create --use
docker run --privileged --rm tonistiigi/binfmt --install all
```

## Pushing to a registry

| Registry                 | Tag format                                              | Login                                                                 |
| ------------------------ | ------------------------------------------------------- | --------------------------------------------------------------------- |
| Docker Hub               | `your-user/your-mcp:tag`                                | `docker login`                                                        |
| GHCR                     | `ghcr.io/your-org/your-mcp:tag`                         | `docker login ghcr.io` (PAT with `write:packages`)                    |
| AWS ECR                  | `<acct>.dkr.ecr.<region>.amazonaws.com/your-mcp:tag`    | `aws ecr get-login-password ... \| docker login --password-stdin ...` |
| Google Artifact Registry | `<region>-docker.pkg.dev/<project>/<repo>/your-mcp:tag` | `gcloud auth configure-docker`                                        |

## Running the image

```bash
docker run --rm -p 8888:8888 \
  -e MCIFY_AUTH_TOKEN=... \
  -e KHIPU_API_KEY=... \
  ghcr.io/your-org/your-mcp:v1
```

Then `curl http://localhost:8888/mcp -X POST -H 'authorization: Bearer ...' ...`.

## CI/CD

Drop-in workflow:
[.github/workflows-templates/deploy-docker.yml](https://github.com/Lelemon-studio/mcify/blob/main/.github/workflows-templates/deploy-docker.yml)

This template builds + pushes a multi-arch image to **GHCR** on every
push to `main` and on every `v*` tag. **No extra secrets needed** —
it uses the auto-provided `GITHUB_TOKEN`.

The image lands at `ghcr.io/<owner>/<repo>:<tag>`. Tags include:

- `sha-<short-sha>` — every commit.
- `<branch-name>` — branch tip.
- `<tag>` — for git tags.
- `latest` — only on default branch.

## Troubleshooting

**`exec format error` when running on a different arch** — the image
was built for the wrong platform. Pass `--platform linux/amd64` (or
the right one) when building, or `--platform` when running.

**`unauthorized: authentication required`** — `docker login <registry>`
first. For GHCR, use a PAT with `write:packages` scope.

**Image works locally, fails on the host** — usually a missing env
var. The Dockerfile inherits `process.env` from the runtime, so set
secrets via `-e` (or compose / k8s).

**Image is too big** — check that you didn't accidentally bundle dev
deps. The default Dockerfile installs with `--prod` / `--omit=dev`,
but if you wrote a custom one, double-check.

**Health check fails on Cloud Run / ECS** — point the platform's
health check at `GET /` (returns 200 from the runtime) on the port
you EXPOSEd.
