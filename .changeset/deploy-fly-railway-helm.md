---
'@mcify/cli': minor
---

`mcify deploy fly` and `mcify deploy railway` (Phase D slice 2) plus a
production-ready Helm chart at `charts/mcify/`.

**Fly.io** — `mcify deploy fly [--app n] [--region scl] [--launch] [--port 8888]`
generates `Dockerfile.mcify` (skipped if you have one) and `fly.toml`
(skipped if you have one), then runs `flyctl deploy`. Pass `--launch`
the first time to run `flyctl launch` instead. Region defaults to `scl`
(Santiago) for Lelemon use; override per project.

**Railway** — `mcify deploy railway [--service n] [--environment production] [--port 8888]`
generates `railway.json` with a Nixpacks plan pinning Node 20 + pnpm 9,
a healthcheck on `/`, and the start command. Then runs `railway up`.

Both targets reuse the existing `buildServer({ target: 'node' })` for
the bundle and surface the right install hint when their CLI is
missing (`flyctl`, `railway`).

**Helm chart** (`charts/mcify/`) — Kubernetes deploy without the CLI:

```bash
helm install my-mcp ./charts/mcify \
  --set image.repository=ghcr.io/your-org/your-mcp \
  --set image.tag=v1 \
  --set secret.existing=my-mcp-secrets
```

Includes Deployment (with non-root securityContext, drop ALL caps,
read-only root + `/tmp` emptyDir), Service, optional Ingress with TLS,
ServiceAccount, optional HPA (autoscaling/v2), and a dev-only Secret
(production should use `secret.existing` referencing an externally
managed Secret). Probes hit the runtime's `GET /` health endpoint
(supplied by `createHttpApp`).

Compatibility: Kubernetes ≥ 1.27, Helm 3.

Smoke-tested both deploy targets in `--dry-run` mode against the
example-khipu config — generated configs verified manually.
