import type { Config } from '@mcify/core';
import { createHttpApp, type HttpHandlerOptions } from '../http.js';

export interface BunServeOptions extends HttpHandlerOptions {
  port?: number;
  hostname?: string;
}

export interface BunServer {
  close(): Promise<void>;
  url: string;
}

/**
 * Start the MCP HTTP server on Bun.
 *
 * Requires Bun runtime — `bun mcify dev` or `bun run` your script.
 */
export const serveBun = (config: Config, options: BunServeOptions = {}): BunServer => {
  const bun = (globalThis as { Bun?: { serve: (opts: unknown) => { stop: () => void; port: number; hostname: string } } })
    .Bun;
  if (!bun) {
    throw new Error('serveBun: not running on Bun. Use serveNode for Node.js.');
  }

  const app = createHttpApp(config, options);
  const port = options.port ?? 8888;
  const hostname = options.hostname ?? '0.0.0.0';

  const server = bun.serve({
    port,
    hostname,
    fetch: (request: Request) => app.fetch(request),
  });

  const host = server.hostname === '::' || server.hostname === '0.0.0.0' ? 'localhost' : server.hostname;
  return {
    url: `http://${host}:${server.port}`,
    close: () => Promise.resolve(server.stop()),
  };
};
