import type { Config } from '@mcify/core';
import { createHttpApp, type HttpHandlerOptions } from '../http.js';

export interface NodeServeOptions extends HttpHandlerOptions {
  port?: number;
  hostname?: string;
}

export interface NodeServer {
  /** Stop the server gracefully. */
  close(): Promise<void>;
  /** The address the server is bound to. */
  url: string;
}

/**
 * Start the MCP HTTP server on Node using `@hono/node-server`.
 *
 * `@hono/node-server` is an optional peer dependency — install it in your project:
 *   npm install @hono/node-server
 */
export const serveNode = async (
  config: Config,
  options: NodeServeOptions = {},
): Promise<NodeServer> => {
  const { serve } = await import('@hono/node-server');
  const app = createHttpApp(config, options);
  const port = options.port ?? 8888;
  const hostname = options.hostname ?? '0.0.0.0';

  return new Promise((resolve, reject) => {
    const server = serve({ fetch: app.fetch, port, hostname }, (info) => {
      const host = info.address === '::' || info.address === '0.0.0.0' ? 'localhost' : info.address;
      resolve({
        url: `http://${host}:${info.port}`,
        close: () =>
          new Promise<void>((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
    server.on('error', reject);
  });
};
