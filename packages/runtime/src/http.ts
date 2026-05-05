import { Hono } from 'hono';
import type { Config, Logger } from '@mcify/core';
import { buildHandlerContext } from './context.js';
import { dispatch } from './dispatch.js';
import { McifyAuthError, getProcessEnv, resolveAuthFromHeaders, type EnvSource } from './auth.js';
import { err, JsonRpcErrorCodes as Codes } from './jsonrpc.js';
import { createConsoleLogger } from './logger.js';
import { RUNTIME_VERSION } from './version.js';

export interface HttpHandlerOptions {
  /** Path the MCP endpoint is mounted at. Defaults to `/mcp`. */
  path?: string;
  /** Logger to use for runtime + per-request logging. */
  logger?: Logger;
  /** Environment source for resolving auth secrets. Defaults to `process.env` when available. */
  env?: EnvSource;
  /** Enable a `GET /` health response. Defaults to true. */
  health?: boolean;
}

export type FetchHandler = (request: Request) => Promise<Response>;

export const createHttpApp = (config: Config, options: HttpHandlerOptions = {}): Hono => {
  const path = options.path ?? '/mcp';
  const logger = options.logger ?? createConsoleLogger({ bindings: { server: config.name } });
  const env = options.env ?? getProcessEnv();
  const app = new Hono();

  if (options.health !== false) {
    app.get('/', (c) =>
      c.json({
        ok: true,
        runtime: 'mcify',
        runtimeVersion: RUNTIME_VERSION,
        server: { name: config.name, version: config.version },
      }),
    );
  }

  app.post(path, async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(err(null, Codes.ParseError, 'Invalid JSON body'), 400);
    }

    const requestId =
      c.req.header('mcp-request-id') ?? c.req.header('x-request-id') ?? undefined;
    const reqLogger = logger.child({
      ...(requestId ? { requestId } : {}),
      method: typeof body === 'object' && body !== null ? (body as { method?: string }).method : undefined,
    });

    let authState;
    try {
      authState = await resolveAuthFromHeaders(config.auth, c.req.raw.headers, env);
    } catch (e) {
      if (e instanceof McifyAuthError) {
        return c.json(err(null, Codes.Unauthorized, e.message), e.status);
      }
      reqLogger.error('auth resolution failed', {
        error: e instanceof Error ? e.message : String(e),
      });
      return c.json(err(null, Codes.InternalError, 'auth resolution failed'), 500);
    }

    const ctx = buildHandlerContext({
      logger: reqLogger,
      auth: authState,
      ...(requestId ? { requestId } : {}),
    });

    const response = await dispatch(body, config, ctx);

    if (response === null) {
      // Notification: no body, 202 Accepted.
      return new Response(null, { status: 202 });
    }
    return c.json(response);
  });

  // GET /mcp returns 405 — server-pushed notifications via SSE come in Phase B.
  app.get(path, (c) => c.text('Method Not Allowed (SSE notifications arrive in Phase B)', 405));

  return app;
};

export const createHttpHandler = (
  config: Config,
  options: HttpHandlerOptions = {},
): FetchHandler => {
  const app = createHttpApp(config, options);
  return async (request: Request) => app.fetch(request);
};
