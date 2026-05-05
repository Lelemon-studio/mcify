import { Hono } from 'hono';
import type * as WsModuleNs from 'ws';
import type * as HonoNodeServerNs from '@hono/node-server';
import type { Config, HandlerContext } from '@mcify/core';

type WsModule = typeof WsModuleNs;
type HonoNodeServerModule = typeof HonoNodeServerNs;
import { buildConfigSnapshot, EventBus, type ConfigSnapshot, type RuntimeEvent } from './events.js';
import { dispatch } from './dispatch.js';
import { buildHandlerContext } from './context.js';
import { createConsoleLogger } from './logger.js';
import { RUNTIME_VERSION } from './version.js';
import type { Logger } from '@mcify/core';

export interface InspectorServerOptions {
  /** Port to listen on. Defaults to 3001. */
  port?: number;
  hostname?: string;
  /**
   * Absolute path to the directory of pre-built inspector static assets
   * (the contents of `@mcify/inspector/dist`). When omitted, only the
   * JSON API is exposed.
   */
  staticRoot?: string;
  /** Logger for the inspector server itself. */
  logger?: Logger;
  /**
   * Existing event bus to share across the MCP server and inspector. If you
   * pass one to {@link createHttpApp}'s options too, the inspector will see
   * tool/resource/prompt telemetry from real MCP requests.
   */
  eventBus?: EventBus;
}

export interface InspectorServer {
  url: string;
  /** Snapshot the inspector currently exposes. Re-set on hot reload. */
  setConfig(config: Config): void;
  bus: EventBus;
  close(): Promise<void>;
}

const buildApp = (opts: {
  getSnapshot: () => ConfigSnapshot;
  bus: EventBus;
  invoke: (toolName: string, args: unknown) => Promise<unknown>;
}): Hono => {
  const app = new Hono();

  app.get('/api/server', (c) =>
    c.json({
      runtime: 'mcify',
      runtimeVersion: RUNTIME_VERSION,
      ...opts.getSnapshot(),
    }),
  );

  app.get('/api/tools', (c) => c.json({ tools: opts.getSnapshot().tools }));
  app.get('/api/resources', (c) => c.json({ resources: opts.getSnapshot().resources }));
  app.get('/api/prompts', (c) => c.json({ prompts: opts.getSnapshot().prompts }));

  app.post('/api/tools/:name/invoke', async (c) => {
    const name = c.req.param('name');
    let body: unknown;
    try {
      body = await c.req.json();
    } catch (e) {
      // Reject malformed JSON explicitly — silently invoking with an empty
      // body would mask a real client bug.
      return c.json(
        {
          ok: false,
          error: `Invalid JSON body: ${e instanceof Error ? e.message : 'parse error'}`,
        },
        400,
      );
    }
    const args =
      body && typeof body === 'object' && 'args' in body ? (body as { args: unknown }).args : body;
    try {
      const result = await opts.invoke(name, args);
      return c.json({ ok: true, result });
    } catch (e) {
      return c.json(
        {
          ok: false,
          error: e instanceof Error ? e.message : 'invocation failed',
        },
        400,
      );
    }
  });

  return app;
};

/**
 * Start the inspector dev server.
 *
 * Two surfaces:
 *   1. A JSON HTTP API for the frontend to read config + invoke tools.
 *   2. A WebSocket at `/events` that streams runtime telemetry.
 *
 * If `staticRoot` is provided, the dist of the `@mcify/inspector` package is
 * served at `/`.
 *
 * Node-specific (uses `@hono/node-server` and `ws`). Cloudflare Workers
 * don't run the inspector — it's a `mcify dev` thing.
 */
export const startInspectorServer = async (
  initialConfig: Config,
  options: InspectorServerOptions = {},
): Promise<InspectorServer> => {
  const port = options.port ?? 3001;
  const hostname = options.hostname ?? '0.0.0.0';
  const bus = options.eventBus ?? new EventBus();
  const logger = options.logger ?? createConsoleLogger({ bindings: { component: 'inspector' } });

  let snapshot: ConfigSnapshot = buildConfigSnapshot(initialConfig);
  let activeConfig: Config = initialConfig;

  const invoke = async (toolName: string, args: unknown): Promise<unknown> => {
    const ctx: HandlerContext = buildHandlerContext({ logger });
    const response = await dispatch(
      {
        jsonrpc: '2.0',
        id: bus.nextId(),
        method: 'tools/call',
        params: { name: toolName, arguments: args },
      },
      activeConfig,
      ctx,
      { eventBus: bus },
    );
    if (!response || 'error' in response) {
      const message = response && 'error' in response ? response.error.message : 'no response';
      throw new Error(message);
    }
    return response.result;
  };

  const app = buildApp({
    getSnapshot: () => snapshot,
    bus,
    invoke,
  });

  if (options.staticRoot) {
    try {
      const { serveStatic } = await import('@hono/node-server/serve-static');
      app.use('/*', serveStatic({ root: options.staticRoot }));
      app.get('/*', serveStatic({ path: 'index.html', root: options.staticRoot }));
    } catch (e) {
      throw new Error(
        `inspector: '@hono/node-server' is required to serve static assets. ` +
          `Install it as a dependency.\n  ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  let serve: HonoNodeServerModule['serve'];
  try {
    ({ serve } = (await import('@hono/node-server')) as HonoNodeServerModule);
  } catch (e) {
    throw new Error(
      `inspector: '@hono/node-server' is required to start the inspector server. ` +
        `Run \`pnpm add @hono/node-server\` (or npm/yarn equivalent).\n  ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  let WebSocketServer: WsModule['WebSocketServer'];
  try {
    // Loaded dynamically so this module stays importable on Workers (where
    // `ws` does not run). The peer dependency is declared optional in
    // package.json so users only pay for it when running `mcify dev`.
    ({ WebSocketServer } = (await import('ws')) as WsModule);
  } catch (e) {
    throw new Error(
      `inspector: 'ws' is required for the WebSocket telemetry feed. ` +
        `Run \`pnpm add ws\` (or npm/yarn equivalent).\n  ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const httpServer = await new Promise<ReturnType<typeof serve>>((resolve, reject) => {
    const s = serve({ fetch: app.fetch, port, hostname }, () => resolve(s));
    s.on('error', reject);
  });

  // @hono/node-server returns a union that includes Http2Server; ws's typings
  // only accept http.Server. We narrow it manually — `serve()` returns an
  // http.Server when no http2 option is passed.
  type WssOpts = NonNullable<ConstructorParameters<typeof WebSocketServer>[0]>;
  const wss = new WebSocketServer({
    server: httpServer as unknown as WssOpts['server'],
    path: '/events',
  });

  wss.on('connection', (ws) => {
    // Send initial snapshot so the client is hydrated immediately.
    const hello: RuntimeEvent = {
      type: 'config:loaded',
      id: bus.nextId(),
      timestamp: new Date().toISOString(),
      serverName: snapshot.name,
      serverVersion: snapshot.version,
      toolCount: snapshot.tools.length,
      resourceCount: snapshot.resources.length,
      promptCount: snapshot.prompts.length,
    };
    ws.send(JSON.stringify(hello));

    const off = bus.on((event) => {
      if (ws.readyState !== ws.OPEN) return;
      try {
        ws.send(JSON.stringify(event));
      } catch (e) {
        // Send can fail mid-flight (peer dropped, buffer full). Log it,
        // unsubscribe so we don't leak the listener, and let the `close`
        // handler do the rest of the cleanup.
        logger.warn('inspector: WS send failed; unsubscribing client', {
          eventType: event.type,
          error: e instanceof Error ? e.message : String(e),
        });
        off();
      }
    });
    ws.on('close', () => off());
    ws.on('error', (e) => {
      logger.warn('inspector: WS client error', {
        error: e instanceof Error ? e.message : String(e),
      });
      off();
    });
  });

  const url = `http://${hostname === '0.0.0.0' || hostname === '::' ? 'localhost' : hostname}:${port}`;
  logger.info('inspector listening', { url });

  return {
    url,
    bus,
    setConfig(config) {
      activeConfig = config;
      snapshot = buildConfigSnapshot(config);
      bus.emit({
        type: 'config:loaded',
        id: bus.nextId(),
        timestamp: new Date().toISOString(),
        serverName: snapshot.name,
        serverVersion: snapshot.version,
        toolCount: snapshot.tools.length,
        resourceCount: snapshot.resources.length,
        promptCount: snapshot.prompts.length,
      });
    },
    close: async () => {
      // Terminate any open WS clients first so they don't keep the http
      // server's connection counter alive past `close()`. `terminate()` is
      // synchronous and shouldn't throw — but if it does, log instead of
      // swallowing.
      for (const client of wss.clients) {
        try {
          client.terminate();
        } catch (e) {
          logger.warn('inspector: failed to terminate WS client during close', {
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
      await new Promise<void>((resolve, reject) => {
        wss.close((err) => (err ? reject(err) : resolve()));
      });
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
};
