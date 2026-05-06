---
'@mcify/cli': patch
---

Per-target deploy guides at [`docs/deploy/`](https://github.com/Lelemon-studio/mcify/tree/main/docs/deploy)
— closes Phase D.

One markdown per target (cloudflare-workers, vercel, fly, railway,
docker, kubernetes) plus an index README. Each guide covers:

- TL;DR copy-paste flow.
- Prerequisites (CLI tools, login, account requirements).
- The `mcify deploy <target>` command and its flags.
- What gets generated (and what stays untouched on rerun).
- Setting secrets the way that target expects.
- Bundle size limits where they apply (Workers 1/10 MB, Vercel 4 MB).
- The matching `.github/workflows-templates/` workflow + required
  repo secrets.
- Common errors and how to fix them.

The Helm chart at `charts/mcify/` keeps its own `README.md` for the
chart-specific values reference; `docs/deploy/kubernetes.md` covers
the install flow + the docker → registry → Helm pipeline.

README.md gains a links block under "Deploy" pointing at each guide.
