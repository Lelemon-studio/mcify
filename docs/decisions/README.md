# Architecture Decision Records (ADRs)

This directory holds a log of significant architectural and process decisions for mcify, in the [Michael Nygard ADR](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) format.

## Why ADRs

When someone (human or agent) asks "why is X done this way?", the answer should be findable in seconds. Code shows *what*; commit messages show *what changed*. ADRs show *why we chose this over the alternatives*, with the constraints and tradeoffs at the time. Future-us re-reads them when the constraints change.

## When to add one

Add an ADR for any decision that:

- **Constrains future work** ("we won't ship X because Y").
- **Has alternatives a reasonable engineer would consider** (Pino vs Winston, esbuild vs tsup, polling vs WebSocket).
- **Touches a security boundary** (timing-safe comparison, token storage, default permissions).
- **Affects users in a hard-to-reverse way** (public API shapes, package layout, dist-tag policy).

Don't add an ADR for trivia like file naming, code style, or "we used `for` instead of `forEach`."

## Format

Copy `template.md` into `NNNN-kebab-title.md`. NNNN is the next zero-padded number. Fill the sections:

- **Status**: `proposed` → `accepted` → (later) `superseded by ADR-XXXX` or `deprecated`.
- **Context**: what's the situation? what constraints exist?
- **Decision**: what we're doing.
- **Consequences**: what becomes easier, what becomes harder, what we're betting on.

Keep ADRs short — a page or two. If you're writing more, the ADR is doing two jobs.

## When an ADR becomes wrong

Don't edit accepted ADRs. Add a new ADR that supersedes the old one, and update the old one's status to `superseded by ADR-XXXX`. The history is the point.

## Index

| # | Title | Status |
|---|---|---|
| [0001](./0001-typescript-first-runtime-not-python.md) | TypeScript-first runtime, not Python | accepted |
| [0002](./0002-changesets-for-monorepo-releases.md) | Changesets for monorepo releases | accepted |
| [0003](./0003-pino-opt-in-not-default.md) | Pino logger opt-in, not default | accepted |
