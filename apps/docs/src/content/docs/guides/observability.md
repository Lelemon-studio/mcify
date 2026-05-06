---
title: Observability and logging
description: Event bus + Pino logger for production visibility.
---

The runtime emits structured events for every tool call, resource read, prompt render, and config reload. You can observe them in three places:

1. **The inspector** — calls log + event stream when running `mcify dev`.
2. **Programmatic event bus subscribers** — register a listener for production telemetry.
3. **Pino logger** — opt-in JSON logger compatible with BetterStack, Datadog, Logtail, etc.

## The event bus

Every runtime ships an `EventBus` instance. Subscribe to it from `defineConfig`:

```ts
import { EventBus, defineConfig } from '@mcify/core';

const bus = new EventBus();

bus.on((event) => {
  if (event.type === 'tool:called') {
    console.log(event.toolName, event.durationMs, event.error ?? 'ok');
  }
});

export default defineConfig({
  ...,
  eventBus: bus,
});
```

Events emitted:

| Type              | When                                                                       | Payload                                                                    |
| ----------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `tool:called`     | After every `tools/call` (success or failure)                              | `toolName`, `args`, `result` or `error`, `durationMs`                      |
| `resource:read`   | After every `resources/read`                                               | `uri`, `params`, `durationMs`, `error?`                                    |
| `prompt:rendered` | After every `prompts/get`                                                  | `promptName`, `args`, `durationMs`, `error?`                               |
| `config:loaded`   | When the config reloads (`mcify dev` hot reload, programmatic `setConfig`) | `serverName`, `serverVersion`, `toolCount`, `resourceCount`, `promptCount` |

The bus is in-memory and per-process. For distributed deployments, fan out from a single subscriber to your queue / log aggregator.

## Pino logger

By default the runtime uses a console-based JSON logger that's safe for stdio transports and Workers. For production Node deploys, opt in to Pino:

```ts
import { createPinoLogger } from '@mcify/runtime';
import pinoLogtail from '@logtail/pino';

const logger = createPinoLogger({
  level: 'info',
  bindings: { service: 'khipu-mcp', env: process.env.NODE_ENV },
  // Pipe to BetterStack / Logtail.
  pino: {
    transport: {
      target: '@logtail/pino',
      options: { sourceToken: process.env.LOGTAIL_TOKEN },
    },
  },
});

defineConfig({
  ...,
  logger,
});
```

Inside a handler, use `ctx.logger`:

```ts
handler: async (input, ctx) => {
  ctx.logger.info('khipu_payment_requested', { amount: input.amount, currency: input.currency });
  const res = await ctx.fetch(...);
  if (!res.ok) {
    ctx.logger.warn('khipu_upstream_error', { status: res.status });
    throw new Error('Khipu request failed');
  }
  return ...;
},
```

The `bindings` are static fields attached to every line. The runtime adds `tool`, `requestId`, and request metadata automatically.

## Why the indirection?

Two reasons we don't just expose Pino directly:

1. **Workers compatibility.** Pino's stream transport doesn't run on edge workers. The default `createConsoleLogger` does. Opt-in keeps the runtime importable everywhere.
2. **Test injection.** `createTestClient` defaults to a no-op logger so test output isn't noisy. You can pass `logger: createConsoleLogger({ level: 'debug' })` when you want chatty tests.

## Connecting to BetterStack

```ts
const logger = createPinoLogger({
  level: 'info',
  bindings: { service: 'khipu-mcp' },
  pino: {
    transport: {
      target: '@logtail/pino',
      options: { sourceToken: process.env.BETTERSTACK_TOKEN },
    },
  },
});
```

Add `@logtail/pino` to your deps (`pnpm add @logtail/pino`). Set `BETTERSTACK_TOKEN` as a secret on your deploy target. Done.

The default Pino schema works with BetterStack's "JSON Lines" parser without configuration.
