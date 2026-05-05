---
'@mcify/cli': patch
---

Drop-in GitHub Actions workflow templates at `.github/workflows-templates/`
covering all five `mcify deploy` targets: Cloudflare Workers, Vercel Edge,
Fly.io, Railway, and Docker (build + push to GHCR).

Each file is a complete `on: push: branches: [main]` job that runs
`pnpm install`, `pnpm test --if-present`, and the corresponding
`mcify deploy <target>` (or `docker/build-push-action` for the Docker
flow). Concurrency groups are scoped per-target so two deploys on the
same target queue up instead of racing.

Users copy the file they need into `.github/workflows/` of their own
project. The templates' README documents the secrets each one expects
(`CLOUDFLARE_API_TOKEN`, `VERCEL_TOKEN`, `FLY_API_TOKEN`, `RAILWAY_TOKEN`,
or just `GITHUB_TOKEN` for Docker → GHCR).

The Docker template generates `Dockerfile.mcify` via `mcify deploy docker
--dry-run` and then builds a multi-arch (`linux/amd64`, `linux/arm64`)
image with `docker/build-push-action@v6` + Buildx + GHA layer cache.
