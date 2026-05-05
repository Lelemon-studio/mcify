import type { Config } from '@mcify/core';
import { createHttpApp, type HttpHandlerOptions } from '../http.js';

export type WorkersFetchHandler = (
  request: Request,
  env?: Record<string, unknown>,
  ctx?: unknown,
) => Promise<Response>;

export type WorkersHandlerOptions = HttpHandlerOptions;

/**
 * Build a Cloudflare Workers `fetch` handler.
 *
 * The Hono app is built once and reused across requests. Each request reads
 * its env via `c.env` (Hono passes the second `fetch` argument through), so
 * Workers' per-request bindings are resolved lazily without rebuilding routes.
 *
 * Usage:
 *
 * ```ts
 * import { createWorkersHandler } from '@mcify/runtime/workers';
 * import config from './mcify.config.js';
 *
 * export default { fetch: createWorkersHandler(config) };
 * ```
 *
 * Custom env mapping (e.g. renaming bindings):
 *
 * ```ts
 * createWorkersHandler(config, {
 *   env: (c) => ({ KHIPU_API_KEY: c.env.KHIPU_KEY as string }),
 * });
 * ```
 */
export const createWorkersHandler = (
  config: Config,
  options: WorkersHandlerOptions = {},
): WorkersFetchHandler => {
  const app = createHttpApp(config, options);
  // Hono's `app.fetch` accepts `(request, env?, executionCtx?)`. The shapes of
  // env and executionCtx are runtime-specific; we forward them as-is. Using
  // `never` casts here keeps us free from a hard dep on @cloudflare/workers-types.
  return async (request, env, ctx) =>
    app.fetch(request, env as never, ctx as never);
};
