import type { Config } from '@mcify/core';
import { createHttpApp, type HttpHandlerOptions } from '../http.js';
import type { EnvSource } from '../auth.js';

export type WorkersFetchHandler = (
  request: Request,
  env?: Record<string, unknown>,
  ctx?: unknown,
) => Promise<Response>;

export interface WorkersHandlerOptions extends HttpHandlerOptions {
  /**
   * Map the Workers `env` argument into the env source used by auth resolution.
   * Defaults to passing `env` through as `EnvSource` (string values only).
   */
  envFromBindings?: (env: Record<string, unknown>) => EnvSource;
}

const defaultEnvFromBindings = (env: Record<string, unknown>): EnvSource => {
  const out: EnvSource = {};
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
};

/**
 * Build a Cloudflare Workers `fetch` handler.
 *
 * Usage:
 *
 * ```ts
 * import { createWorkersHandler } from '@mcify/runtime/workers';
 * import config from './mcify.config.js';
 *
 * export default { fetch: createWorkersHandler(config) };
 * ```
 */
export const createWorkersHandler = (
  config: Config,
  options: WorkersHandlerOptions = {},
): WorkersFetchHandler => {
  const envFromBindings = options.envFromBindings ?? defaultEnvFromBindings;
  return async (request, env) => {
    const resolvedEnv = env ? envFromBindings(env) : options.env;
    const app = createHttpApp(config, {
      ...options,
      ...(resolvedEnv ? { env: resolvedEnv } : {}),
    });
    return app.fetch(request);
  };
};
