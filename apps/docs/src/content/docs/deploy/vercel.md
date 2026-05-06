---
title: Deploy to Vercel Edge
description: Deploy your mcify server to Vercel Edge Functions, with preview deploys per branch.
---

## TL;DR

```bash
# One-time: log in + link the project
npx vercel login
npx vercel link

# Preview deploy
mcify deploy vercel

# Production deploy
mcify deploy vercel --prod
```

The CLI bundles your config as a Vercel Edge Function, generates
`api/mcp.mjs` + `vercel.json`, then runs `vercel deploy`. Result: a
preview URL (or your prod domain) with `/mcp` wired up.

## Prerequisites

- A Vercel account.
- Either `npx vercel login` once on your machine, or `VERCEL_TOKEN` set
  in your shell.
- The project linked once: `npx vercel link`.

## Command

```bash
mcify deploy vercel [options]
```

| Flag              | Default             | What it does                                                           |
| ----------------- | ------------------- | ---------------------------------------------------------------------- |
| `--config <path>` | `./mcify.config.ts` | Path to your mcify config.                                             |
| `--prod`          | off (preview)       | Promote to production instead of a preview deploy.                     |
| `--project <n>`   | from `vercel link`  | Project name override.                                                 |
| `--dry-run`       | off                 | Generate `api/mcp.mjs` + `vercel.json` + bundle, skip `vercel deploy`. |

## What gets generated

```
.
├── api/
│   └── mcp.mjs       # re-exports the bundled edge function
├── dist/vercel/
│   └── (bundle)
└── vercel.json       # rewrite /(.*) → /api/mcp
```

If `vercel.json` already exists it is **left untouched** — your
custom routing wins.

## Setting secrets

Set them in the Vercel dashboard (Project → Settings → Environment
Variables) **or** via CLI:

```bash
npx vercel env add MCIFY_AUTH_TOKEN production
npx vercel env add KHIPU_API_KEY production
```

The runtime reads them at boot through `process.env`.

## Bundle size limits

Vercel Edge Functions cap at **4 MB compressed**. mcify warns you
proactively if you cross that. If you hit it, you can:

1. Switch to Vercel's serverless Node target (not yet first-class in
   mcify — open an issue if you need it).
2. Move to `mcify deploy fly` or `railway` for a non-edge runtime.

## Preview deploys per branch

Vercel automatically deploys a preview for every push when the project
is linked. The included CI template runs `mcify deploy vercel --prod`
on `main`; for previews you can drop `--prod` or just push to a branch
and let Vercel's GitHub integration handle it.

## CI/CD

Drop-in workflow:
[.github/workflows-templates/deploy-vercel.yml](https://github.com/Lelemon-studio/mcify/blob/main/.github/workflows-templates/deploy-vercel.yml)

Required repo secrets:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Get the org/project ids with `npx vercel link` then read
`.vercel/project.json`.

## Troubleshooting

**`Error: No existing credentials`** — run `npx vercel login` or set
`VERCEL_TOKEN`.

**`Error: Project not linked`** — run `npx vercel link` once in your
project root.

**`/mcp` returns 404** — check that `vercel.json` has the rewrite. If
you customized it, make sure `/(.*)` (or at least `/mcp`) routes to
`/api/mcp`.

**`Function exceeded 50 MB`** — that's the deploy artifact cap (not
the runtime cap). Trim dev dependencies you accidentally bundled.

**Edge runtime complains about `process.env`** — Vercel's edge runtime
exposes a limited subset of Node APIs. mcify's bundle uses Web-standard
Request/Response, so `process.env` works for env vars but Node-only
modules (e.g. `fs`) won't load. Move that work to a tool that runs
at request time only (no top-level `import 'fs'`).
