# CLAUDE.md

This repository's AI agent instructions live in **[AGENTS.md](./AGENTS.md)**.
Read that first — it covers conventions, invariants, and anti-patterns that apply to any AI assistant.

The notes below are Claude Code specific.

## Slash commands

Project-level slash commands are defined in `.claude/commands/`:

| Command | What it does |
|---|---|
| `/check` | Runs `pnpm typecheck`, `pnpm lint`, `pnpm test` in order. Stops at the first failure. |
| `/release` | Walks through creating a Changeset for the current branch's diff. |
| `/add-tool` | Scaffolds a new MCP tool stub with Zod schemas and a placeholder handler. |

Type the command name preceded by `/` in Claude Code and it'll be invoked.

## Subagents

Project subagents live in `.claude/agents/` (none yet — added as the project grows).

## Quick reference

```bash
# Always pass before claiming code is done:
pnpm typecheck && pnpm lint && pnpm test
```

Before suggesting a release: read `.changeset/README.md`.

When in doubt about an architectural call: check `docs/decisions/` for an existing ADR. If none applies and the call is non-trivial, propose a new one (`docs/decisions/NNNN-title.md`) in the same PR.
