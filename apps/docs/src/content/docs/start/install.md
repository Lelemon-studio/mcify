---
title: Install
description: One-line install via npx, no global needed.
---

mcify ships as three npm packages on the `alpha` dist-tag. The CLI is the only thing you invoke directly:

```bash
npx @mcify/cli@alpha init my-mcp
```

That command:

1. Downloads the latest `@mcify/cli@alpha`.
2. Scaffolds `./my-mcp/` from the `from-scratch` template.
3. Substitutes `{{name}}` with `my-mcp` everywhere.

No global install. No `pnpm add -g`. The CLI lives in your project's `devDependencies` after `pnpm install`.

## Requirements

- **Node ≥ 20** — the runtime targets ES2022 and modern Web APIs.
- **A package manager**: pnpm 9+ (recommended), npm 10+, or yarn 4+. The CLI auto-detects from your lockfile.

## Pick a template

```bash
# Empty starter (one greet tool)
npx @mcify/cli@alpha init my-mcp

# Code-first with Zod schemas centralized in src/schemas.ts
npx @mcify/cli@alpha init my-mcp --template from-zod

# Clone the Khipu connector (Chilean payment links) as a starting point
npx @mcify/cli@alpha init my-khipu --template example-khipu
```

There's no `--template from-openapi` (yet) — that flow lives behind the [generator command](/guides/from-openapi/) instead, so you keep authoring your own `mcify.config.ts` and only generate the per-spec tool files.

## Verify

```bash
cd my-mcp
pnpm install
pnpm dev
```

You should see:

```
✓ my-mcp v0.1.0
mcify MCP       http://localhost:8888/mcp
mcify inspector http://localhost:3001
```

Open `http://localhost:3001` — that's the inspector. The `Tools` tab lists the one tool the template ships (`greet`); `Playground` lets you call it.

## Next

- [Your first MCP server](/start/first-server/) — add a real tool.
- [Connect to Claude / Cursor](/start/connect-clients/) — point an agent at the dev server.
