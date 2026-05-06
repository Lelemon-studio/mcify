---
title: '@mcify/runtime'
description: MCP server runtime — transports, adapters, event bus, logger.
---

The runtime takes a `Config` from `@mcify/core` and serves it. Two transports (stdio and HTTP), four adapters (Node, Bun, Workers, edge), and the in-memory event bus.

## Transports

### stdio

For Claude Desktop / Cursor that launch your MCP as a child process.

```ts
import { serveStdio } from '@mcify/runtime';
import config from './mcify.config.js';

await serveStdio(config);
```

The runtime reads JSON-RPC from stdin, writes responses to stdout, logs to stderr (so logs don't corrupt the protocol stream).

### HTTP

For agents that talk to your server over the network.

```ts
import { createHttpApp } from '@mcify/runtime';

const app = createHttpApp(config); // returns a Hono app
```

Mounts `POST /mcp` (the JSON-RPC endpoint) and `GET /` (the health endpoint).

## Adapters

Pick the adapter for your target runtime — the API is the same shape, the implementation differs.

### Node

```ts
import { serveNode } from '@mcify/runtime/node';

const server = await serveNode(config, { port: 8888, hostname: '0.0.0.0' });
// server.url, server.close()
```

Uses `@hono/node-server` (peer dependency). Add it to your deps if you `serveNode`.

### Bun

```ts
import { serveBun } from '@mcify/runtime/bun';

const server = serveBun(config, { port: 8888 });
```

Uses `Bun.serve` directly.

### Workers

```ts
import { createWorkersHandler } from '@mcify/runtime/workers';

export default {
  fetch: createWorkersHandler(config, {
    envBindings: ['MCIFY_AUTH_TOKEN', 'KHIPU_API_KEY'],
  }),
};
```

Reads env from `c.env` (Workers convention) instead of `process.env`. The `envBindings` array tells the runtime which Worker bindings to surface as env vars to your handlers.

## Event bus

```ts
import { EventBus } from '@mcify/runtime';

const bus = new EventBus();

bus.on((event) => { /* ... */ });        // subscribe; returns unsubscribe fn
bus.emit({ type: 'tool:called', ... });  // emit (the runtime does this)
bus.nextId();                             // generate a sortable event id
bus.listenerCount();                      // useful to skip work when no listeners

defineConfig({ ..., eventBus: bus });
```

Events: `tool:called`, `resource:read`, `prompt:rendered`, `config:loaded`. See [Observability](/guides/observability/).

## Logger

```ts
import { createConsoleLogger, createPinoLogger } from '@mcify/runtime';

createConsoleLogger({ bindings: { service: 'khipu' }, sink: 'stderr' });

createPinoLogger({
  level: 'info',
  bindings: { service: 'khipu' },
  sink: 'stdout',
  pino: pinoOptions, // pass-through to pino()
  destination: writableStream, // override the destination (test injection)
});
```

The console logger is Workers-safe by default. Pino requires a Node runtime; opt-in for production.

## Inspector helpers

```ts
import { startInspectorServer } from '@mcify/runtime/inspector';

const inspector = await startInspectorServer(config, {
  port: 3001,
  staticRoot: '/path/to/@mcify/inspector/dist',
  eventBus: bus,
});
```

`mcify dev` calls this for you. Bind it directly only when you're embedding the inspector into a custom dev tool.

## Test client

```ts
import { createTestClient } from '@mcify/runtime/test';

const client = createTestClient(config, {
  auth: { type: 'bearer', token: 'test' },
  fetch: vi.fn().mockImplementation(...),
});

await client.callTool('foo', { ... });
await client.readResource('uri://...');
await client.getPrompt('foo', { ... });
```

See [Testing without the network](/guides/testing/).

## Dispatch (low-level)

If you're building your own transport, the runtime exposes the JSON-RPC dispatcher:

```ts
import { dispatch } from '@mcify/runtime';

const response = await dispatch(jsonRpcRequest, config, ctx, { eventBus });
```

This is what `serveStdio` and `createHttpApp` both call internally.

## Version

```ts
import { RUNTIME_VERSION } from '@mcify/runtime';
```

Useful when the inspector / observability shows the runtime version next to your service version.
