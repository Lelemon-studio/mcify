---
'mcify-docs': minor
---

Public documentation site at [docs.mcify.dev](https://docs.mcify.dev) — closes Phase C.6.

Built on **Astro Starlight** with the **`starlight-llms-txt`** plugin, so the site auto-generates three machine-readable indexes alongside the rendered HTML:

- **`/llms.txt`** — index of every page in the [llmstxt.org](https://llmstxt.org) format. Paste the URL into Claude / ChatGPT / Cursor and the model can navigate the whole site.
- **`/llms-full.txt`** — every page inlined into one ~80KB markdown file. One fetch and the model has full docs in context.
- **`/llms-small.txt`** — pruned version for context-bounded models (deploy details excluded).

## Sections

- **Start** — what is mcify, install, your first server, connect to Claude/Cursor/agents.
- **Concepts** — tools, resources, prompts, auth, middleware.
- **Guides** — creating effective tools, six concrete antipatterns to avoid, from-OpenAPI / multi-spec, testing, observability.
- **AI prompts** — copy-paste prompts for Claude Code / Cursor / Windsurf to add a tool, wrap an API, debug a misbehaving tool, or migrate to multi-spec. Each prompt instructs the model to read `/llms-full.txt` first, so it grounds against current docs instead of stale training data.
- **Deploy** — per-target guides for Cloudflare Workers, Vercel Edge, Fly.io, Railway, Docker, Kubernetes (mirrors of the existing `docs/deploy/*` markdown).
- **Reference** — CLI flag-by-flag, `@mcify/core` exports, `@mcify/runtime` adapters, schema helpers.

## Deployment

Deploys to **Cloudflare Pages** (`mcify-docs` project) on every push to `main` that touches `apps/docs/**`. Workflow at `.github/workflows/deploy-docs.yml`. Custom domain `docs.mcify.dev` wired via API; the project also lives at `mcify-docs.pages.dev`.

## Why AI-first

Three things, on top of the standard Starlight chrome:

1. **`/llms.txt` family is generated, not hand-maintained** — the plugin walks the same content collection Starlight renders, so the agent index never drifts from the rendered docs.
2. **Every "AI prompt" page starts with `Read these docs first: …`** pointing at our own `/llms-full.txt`. This works around the model relying on stale training data and consistently produces correct, idiomatic mcify code.
3. **The "Antipatterns" page is concrete** — six failure modes from Anthropic's _Writing Tools for Agents_ + practical experience, each with a "smell" code block and a fix. The kind of content models read and apply correctly.

32 pages, 31s build, ~3,500 lines of llms-full.txt.
