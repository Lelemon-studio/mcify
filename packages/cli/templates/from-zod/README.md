# {{name}}

MCP server scaffolded with `mcify init --template from-zod`. The pattern: keep all your Zod schemas in `src/schemas.ts`, import them where you call `defineTool`, reuse the inferred types in your handlers.

## Run

```bash
pnpm install
pnpm dev
```

Inspector at http://localhost:3001, MCP endpoint at http://localhost:8888/mcp.

## Layout

```
src/
├── schemas.ts        # All Zod schemas in one file. Reused by tools + tests.
└── tools/
    ├── create-user.ts
    └── get-user.ts
mcify.config.ts       # `defineConfig` wires the tools, declares server-side auth.
```

## Why this pattern

- **Schemas live once.** Change a field in `User` and every tool that imports it picks it up. No drift.
- **Inferred types.** `type User = z.infer<typeof User>` keeps the runtime check and the TS type in sync — handlers never see an "any."
- **Easy to test.** Import the same schemas in your test files; build fixtures with `User.parse(...)`.

## Next steps

1. Replace the placeholder handlers with real calls to your service.
2. Set `MCIFY_AUTH_TOKEN` in `.env` (any long random string) for the bearer auth.
3. When schemas multiply, split `schemas.ts` into folders (e.g. `schemas/user.ts`, `schemas/billing.ts`) and re-export from an `index.ts`.

## Deploy

```bash
mcify deploy cloudflare      # Cloudflare Workers
mcify deploy fly             # Fly.io
mcify deploy railway         # Railway
mcify deploy docker --push   # Docker → registry
```

See https://github.com/Lelemon-studio/mcify/tree/main/docs/deploy for per-target details.
