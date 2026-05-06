---
title: Deploy to Kubernetes (Helm)
description: Install your mcify server on Kubernetes via the official Helm chart.
---

## TL;DR

```bash
# 1. Build + push your image (one time per release)
mcify deploy docker --tag ghcr.io/your-org/your-mcp:v1 --push

# 2. Install the chart pointing at that image
helm install my-mcp ./charts/mcify \
  --set image.repository=ghcr.io/your-org/your-mcp \
  --set image.tag=v1 \
  --set secret.existing=my-mcp-secrets

# 3. Port-forward to verify locally
kubectl port-forward svc/my-mcp-mcify 8888:80
```

The Helm chart lives at [`charts/mcify/`](https://github.com/Lelemon-studio/mcify/tree/main/charts/mcify).
It runs the same Node bundle as `mcify deploy docker`, wrapped in a
Deployment + Service + (optional) Ingress + (optional) HPA.

## Prerequisites

- Kubernetes ≥ 1.27 (the chart uses `autoscaling/v2` and
  `networking.k8s.io/v1`).
- Helm 3.
- An image already pushed somewhere your cluster can pull from — see
  [docker.md](./docker.md).
- A Kubernetes Secret holding your runtime env vars (recommended for
  prod) — see "Secrets" below.

## Recommended values

```yaml
# my-values.yaml
image:
  repository: ghcr.io/your-org/your-mcp
  tag: v1.2.3
  pullPolicy: IfNotPresent

replicaCount: 2

env:
  NODE_ENV: production

secret:
  existing: my-mcp-secrets # pre-created Kubernetes Secret

resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70

ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: mcp.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: mcp-example-com-tls
      hosts:
        - mcp.example.com
```

```bash
helm upgrade --install my-mcp ./charts/mcify -f my-values.yaml
```

## What ships in the chart

| Resource                  | Purpose                                                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `Deployment`              | Runs the mcify container. Probes hit `GET /`. SecurityContext: non-root user 1000, drop ALL caps, read-only root + `/tmp` emptyDir. |
| `Service`                 | ClusterIP by default, switchable to LoadBalancer. Routes port 80 → container `http` port.                                           |
| `Ingress`                 | Optional. `networking.k8s.io/v1`, supports TLS.                                                                                     |
| `ServiceAccount`          | Optional. `automountServiceAccountToken: false` by default — the runtime doesn't talk to the K8s API.                               |
| `HorizontalPodAutoscaler` | Optional. CPU + memory targets.                                                                                                     |
| `Secret`                  | **Dev only.** For production use `secret.existing: <name>` and manage the secret with sops / external-secrets / Vault.              |

## Secrets

Three modes via the `secret` block:

```yaml
# (a) Dev — chart creates the Secret with values you embed.
secret:
  create: true
  values:
    MCIFY_AUTH_TOKEN: "dev-token"

# (b) Production — point at an existing Secret you manage elsewhere.
secret:
  create: false
  existing: my-mcp-secrets

# (c) None — no env Secret. Tools needing auth fail.
secret:
  create: false
  existing: ""
```

The Secret is mounted as env vars via `envFrom: secretRef` — every
key on the Secret becomes a `process.env` entry inside the container.

## Probes

Both probes hit `GET /` — the runtime's built-in health endpoint
served by `createHttpApp`. Disable individually if your routing
doesn't include `/`:

```yaml
probes:
  liveness:
    enabled: false
```

## Local validation

```bash
helm lint ./charts/mcify
helm template ./charts/mcify -f my-values.yaml \
  | kubectl apply --dry-run=client -f -
```

## CI/CD

There's no Helm-specific workflow template — the typical pattern is:

1. Push image with [`deploy-docker.yml`](https://github.com/Lelemon-studio/mcify/blob/main/.github/workflows-templates/deploy-docker.yml)
   (multi-arch, GHCR).
2. From your deploy job (Argo CD, Flux, GitHub Actions with kubectl),
   `helm upgrade --install` pointing at the new tag.

If you want the Helm release tied to git tags, parameterize
`image.tag` from `${{ github.ref_name }}`.

## Troubleshooting

**Pods crash-loop on startup** — `kubectl logs <pod>` usually shows a
missing env var. Check that your Secret is mounted (`kubectl describe
pod <pod>` → Mounts) and includes `MCIFY_AUTH_TOKEN`.

**Probes failing** — confirm the container actually listens on the
port the chart expects (`service.port` → `containerPort`). The
runtime uses `PORT` env var; the chart sets it for you.

**Read-only root filesystem errors** — your tool writes somewhere
other than `/tmp`. Either make it write to `/tmp` (it's mounted as
emptyDir) or extend the chart's `volumes` / `volumeMounts`.

**Ingress works but cert-manager doesn't issue** — usually a missing
HTTP-01 reachability path. Check that `mcp.example.com` resolves to
the ingress controller's IP and that port 80 is open.

**HPA doesn't scale up under load** — verify the metrics-server is
installed (`kubectl get apiservice v1beta1.metrics.k8s.io`). Without
it, CPU/memory targets resolve to `<unknown>` and the HPA stays at
`minReplicas`.
