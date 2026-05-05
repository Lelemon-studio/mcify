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
  return (request, env, ctx) =>
    app.fetch(request, env as Record<string, unknown>, ctx as ExecutionContext | undefined);
};

// Minimal Workers ExecutionContext type so we don't pull in @cloudflare/workers-types as a hard dep.
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}
