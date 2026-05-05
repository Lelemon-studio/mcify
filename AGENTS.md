# AGENTS.md — AI agent instructions for mcify

> This file is read by AI coding assistants (Claude Code, Cursor, Cody, Windsurf, Copilot Workspace, OpenAI Codex, etc.) to understand the codebase and project conventions. Keep it tight and actionable. When something here goes stale, fix it in the same PR that exposed the staleness.

## TL;DR

mcify is an open-source platform that turns any API into an MCP (Model Context Protocol) server. CLI-first, local-first, dev-friendly. Apache 2.0. Maintained by Lelemon Studio.

Stack: TypeScript (strict, ESM), Hono, Zod, Pino (opt-in), esbuild, pnpm workspaces, Vitest, Turbo, ESLint flat config, Changesets.

Three publishable packages under the `@mcify` scope on npm:

| Package | Role |
|---|---|
| `@mcify/cli` | The `mcify` binary: `init`, `dev`, `build`, `generate` |
| `@mcify/core` | Builder lib: `defineTool`, `defineResource`, `definePrompt`, `defineConfig`, schemas, auth |
| `@mcify/runtime` | MCP server runtime: stdio + HTTP transports, multi-target adapters |

## Repository layout

```
mcify/
├── packages/
│   ├── core/         @mcify/core — pure TS, no runtime deps beyond zod
│   ├── runtime/      @mcify/runtime — Hono + MCP SDK + Pino
│   ├── cli/          @mcify/cli — esbuild + tsx + chokidar
│   ├── inspector/    (Phase B — not yet present)
│   └── examples/     Reference connectors (Phase C)
├── apps/
│   └── docs/         mcify.dev (Astro Starlight, placeholder)
├── .changeset/       Changesets — release management
├── .github/
│   └── workflows/    CI (typecheck/lint/test/build) and Release (changesets/action)
├── .claude/          Slash commands and subagents for Claude Code
├── docs/decisions/   ADRs (Architecture Decision Records)
└── eslint.config.js  Flat config, applies to the whole monorepo
```

## Critical invariants — break these and things go wrong

### Workers / edge compatibility
- `@mcify/core` and `packages/runtime/src/dispatch.ts` MUST run on Cloudflare Workers, Bun, and Node alike. **No Node-only APIs** (`node:fs`, `node:child_process`, `process.cwd()`, etc.) in those modules.
- Pino logger is **opt-in** — Pino uses `node:fs` internals and breaks on Workers. Default is `createConsoleLogger`, which is portable.
- Adapters in `packages/runtime/src/adapters/{node,bun,workers}.ts` are runtime-specific. Node-only code lives there, not in shared modules.
- Cloudflare Workers do not preserve module-level state across cold starts in the way Node does. The Hono app must be **built once per handler instance**, not per request (we hit this bug in `createWorkersHandler`).

### Security boundaries
- All MCP tool inputs MUST be validated with Zod at the boundary. The runtime calls `tool.invoke(rawInput, ctx)` which runs `safeParse` and throws `McifyValidationError` on failure.
- Token comparison MUST use `constantTimeEqual` (in `packages/runtime/src/auth.ts`) — XOR-fold timing-safe. Plain `===` leaks the matched prefix length.
- Logs MUST NOT include credentials or PII. The Logger interface accepts structured `meta` — keep secrets out of it.
- JSON-RPC params MUST be validated with the official MCP SDK schemas before dispatch (`CallToolRequestParamsSchema` etc.). Don't `as` cast.

### Type safety
- TypeScript strict, `noUncheckedIndexedAccess: true`. No `any` without an inline justification.
- For factories that have a static and a parameterized form (resources, prompts), use **function overloads** — see `defineResource`, `definePrompt`. Don't use `Record<string, never>` defaults.
- For URI templates, build the regex in **one pass**: walk the template, escape literal slices, weave in named groups. Escaping `{` and `}` first breaks placeholder substitution.

### Process / transport
- stdio MCP transport: log to **stderr only**. Stdout is the protocol channel — anything on it corrupts the JSON-RPC stream.
- HTTP MCP transport: notifications return `202` with no body. Real responses return `200` with the JSON-RPC envelope. `GET /mcp` returns `405` until SSE arrives in Phase B.

## Conventions

### Commits

Conventional Commits: `type(scope): description`. The full body explains *why*, not *what* — the diff is the what.

Allowed types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `ci`, `build`, `style`, `revert`.

Allowed scopes (rough): `core`, `cli`, `runtime`, `inspector`, `examples`, `docs`, `release`, `repo`, `deps`, `agents`. Match an existing scope when one fits.

### Code

- TypeScript strict, ES modules. Import specifiers use `.js` extensions even for `.ts` files (NodeNext + bundler resolution accept both, but emitted JS needs `.js`).
- Schemas live with the thing they describe.
- Tests next to source as `*.test.ts`. Helpers in `_test-utils/` (excluded from build via `tsconfig.exclude`).
- No `console.log` in committed code — use the `Logger` interface from `@mcify/core`.
- Errors: throw `Error` subclasses (`McifyValidationError`, `McifyAuthError`) with structured fields. Don't throw strings.

### Releases

We use **Changesets**. After making a user-facing change:

```bash
pnpm changeset
```

Pick which packages changed and the bump kind. The PR includes the new `.changeset/<random>.md`. Don't bump versions manually — the CI release PR does it.

When a change isn't user-facing (build config, tests, docs, ADRs), skip the changeset.

### Pull requests

- Run `pnpm typecheck && pnpm lint && pnpm test && pnpm build` before opening.
- Branch from `main`, descriptive name, one logical change per PR.
- Squash and merge.
- Add a changeset if the change is user-facing.

## Anti-patterns we've actually hit (and fixed)

These are mistakes we made on this codebase. Don't redo them.

| Anti-pattern | Fix | Where |
|---|---|---|
| Reconstructing the Hono app per request in Workers | Build once, pass env via `c.env` | `runtime/adapters/workers.ts` |
| Validating JSON-RPC params with `as` casts | Use SDK Zod schemas, map ZodError → InvalidParams | `runtime/dispatch.ts` |
| Comparing tokens with `===` (timing leak) | `constantTimeEqual` | `runtime/auth.ts` |
| Top-level `none` export from `@mcify/core` | Only via `auth.none()` namespace | `core/index.ts` |
| `'system'` role in `PromptRole` (MCP spec rejects) | Restrict to `'user' \| 'assistant'` | `core/prompt.ts` |
| Escaping `{}` before processing URI placeholders | Build regex in one pass | `runtime/dispatch.ts:matchUriTemplate` |
| Pulling commander/yargs/inquirer for arg parsing | 50 LOC of `parseArgs` covers it | `cli/args.ts` |
| `Record<string, never>` for "no params" factories | Function overloads (static vs parameterized) | `core/resource.ts`, `core/prompt.ts` |
| Reading `process.env` directly in shared code | Use `EnvSource` parameter so Workers bindings work | `runtime/auth.ts` |
| Non-null assertions (`!`) after a length check | Extract to a const before the closure | `runtime/sdk-server.ts` |

## Useful commands

```bash
pnpm install
pnpm dev                            # turbo run dev (all packages)
pnpm build                          # turbo run build
pnpm test                           # turbo run test
pnpm lint                           # eslint . --max-warnings=0
pnpm lint:fix                       # eslint . --fix
pnpm typecheck                      # turbo run typecheck

pnpm changeset                      # interactive: declare a release
pnpm changeset status               # what's pending
pnpm changeset version              # apply pending (CI runs this)
pnpm changeset publish              # publish to npm (CI runs this)

pnpm --filter @mcify/cli build      # build a single package
pnpm --filter @mcify/runtime test   # test a single package
pnpm --filter @mcify/core dev       # tsc --watch on one package
```

## When in doubt

1. **Read the existing code.** The repo is small (~4500 LOC of source as of A.7). `grep` for the thing you're touching and look for similar patterns.
2. **Run the tests.** Before claiming a refactor works, `pnpm test` the affected packages.
3. **Don't add a dep without thinking.** Ask whether 30–50 LOC would do it. We rolled our own arg parser, our own constant-time comparison, our own logger interface, and the file is shorter than the README of the alternative.
4. **Prefer overloads to conditional types** for user-facing APIs.
5. **If you find a stale rule in this file, fix it in the same PR.**

## Where to find more

- Phase tracker (with done/todo per task): `specs/20260505-0047-mcify-mcp-platform/PHASES.md` (in the workspace, not the public repo).
- ADRs (decisions and why): `docs/decisions/`.
- Templates for `mcify init`: `packages/cli/templates/`.
- CI: `.github/workflows/ci.yml`. Release: `.github/workflows/release.yml`.
- Changesets workflow: `.changeset/README.md`.

## Status

Phase A (core + runtime + CLI) is complete. Phase B (inspector) and Phase C (real connector examples) are next. Phase D (deploy commands), Phase E (cloud), Phase F (marketplace) follow.

Don't add features to fill out a vision document. Add what the next concrete user needs.
