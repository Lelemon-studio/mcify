# mcify Helm chart

Deploys an mcify MCP server (Node.js, HTTP transport) on Kubernetes.

> **Status:** alpha. The chart works end-to-end; some defaults (image repository in particular) need to be overridden for any real deployment.

## TL;DR

```bash
# 1. Build + push your image (one time per release)
mcify deploy docker --tag ghcr.io/your-org/your-mcp:v1 --push

# 2. Install the chart pointing at that image
helm install my-mcp ./charts/mcify \
  --set image.repository=ghcr.io/your-org/your-mcp \
  --set image.tag=v1 \
  --set secret.existing=my-mcp-secrets   # Kubernetes Secret with MCIFY_AUTH_TOKEN

# 3. Port-forward to test locally
kubectl port-forward svc/my-mcp-mcify 8888:80
```

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
  existing: my-mcp-secrets # Kubernetes Secret created out-of-band

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

| Resource                  | Purpose                                                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `Deployment`              | Runs the mcify container with probes, securityContext (non-root, read-only root, drop ALL caps), `/tmp` emptyDir, optional pull secrets. |
| `Service`                 | ClusterIP by default, switchable to LoadBalancer. Routes port 80 to the container's `http` port.                                         |
| `Ingress`                 | Optional. Standard `networking.k8s.io/v1` ingress with TLS support.                                                                      |
| `ServiceAccount`          | Optional. `automountServiceAccountToken: false` by default — the runtime doesn't talk to the K8s API.                                    |
| `HorizontalPodAutoscaler` | Optional. CPU + memory targets.                                                                                                          |
| `Secret`                  | **Dev only.** For production use `secret.existing: <name>` and manage the secret with sops / external-secrets / Vault.                   |

## Secrets — production pattern

Don't put real tokens in `values.yaml`. The chart honors three modes via the `secret` block:

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

# (c) None — the runtime starts with no env Secret. Tools requiring auth fail.
secret:
  create: false
  existing: ""
```

The Secret keys are mounted as env vars via `envFrom: secretRef`, so any key
set on the Secret becomes available inside the container.

## Probes

Both probes hit `GET /` on the runtime — that's the health endpoint
`createHttpApp` exposes by default. Disable individually if your routing
doesn't include it:

```yaml
probes:
  liveness:
    enabled: false
```

## Local validation

```bash
helm lint ./charts/mcify
helm template ./charts/mcify -f my-values.yaml | kubectl apply --dry-run=client -f -
```

## Compatibility

- Kubernetes ≥ 1.27 (uses `autoscaling/v2` and `networking.k8s.io/v1`).
- Helm 3.

## License

Apache 2.0 (inherited from mcify).
