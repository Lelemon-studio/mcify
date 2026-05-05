# 0003. Pino logger opt-in, not default

- **Status**: accepted
- **Date**: 2026-05-05

## Context

mcify's runtime ships a `Logger` interface (in `@mcify/core/context.ts`) with `trace`, `debug`, `info`, `warn`, `error`, `child`. Users want structured JSON logs in production. The natural choice for Node is Pino — fast, structured, the default in NestJS, Fastify, Cal.com, and most modern TS backends.

But mcify supports Cloudflare Workers as a first-class deploy target, and Pino does not run cleanly on Workers. Pino's default destination uses `node:fs` via `sonic-boom`. Patching that out per-runtime is fragile, and any user who imports `@mcify/runtime` on Workers expecting the default logger would crash at request time.

## Decision

The default runtime logger is `createConsoleLogger` (in `packages/runtime/src/logger.ts`) — a tiny zero-dep adapter that writes JSON lines via `console` (or `process.stderr` for stdio mode). It works on Node, Bun, Deno, and Workers identically.

`createPinoLogger` is provided as an **opt-in** alternative for users who want production-grade logging on Node/Bun. They wire it explicitly:

```ts
serveNode(config, { logger: createPinoLogger({ level: 'info' }) });
```

`createPinoLogger` accepts a pre-configured Pino instance (`opts.pino`), so users who want `@logtail/pino`, `pino-pretty`, `pino-roll`, or any other transport pass them through Pino directly.

## Alternatives considered

- **Pino as default**: best DX on Node but breaks Workers silently. We hit this exact failure mode in lelemon-app earlier and don't want to relive it.
- **No Pino at all, only the console adapter**: ships the same shape on every runtime but punishes Node users who want structured logs. Lost — Pino is one of mcify's "production-ready out of the box" promises in the README.
- **Conditional Pino import based on detected runtime**: clever, fragile, hard to reason about. Lost.

## Consequences

- **Becomes easier**: Workers and Node both work without per-target logger configuration. Users who want Pino get it with one line.
- **Becomes harder**: a beginner reading the README sees two logger choices and has to pick. Mitigation: the README's quick-start uses the default and never mentions Pino. The Pino section sits in the deployment guide.
- **What we're betting on**: most early users are on Node + want structured logs and will flip the switch. Workers users get a working default and are happy not to think about it.
- **Reversibility**: high. If we ever decide to make Pino default, it's a single line in `buildHandlerContext` plus a dep change. The opt-in API stays.
