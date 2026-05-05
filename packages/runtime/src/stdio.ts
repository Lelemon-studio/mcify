import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Config } from '@mcify/core';
import { buildSdkServer, type SdkServerOptions } from './sdk-server.js';

export interface StdioServeOptions extends SdkServerOptions {
  /** Called once the server is connected to the stdio transport. */
  onReady?: () => void;
}

/**
 * Run the MCP server over stdio. Blocks until stdin closes (or the process is killed).
 *
 * Suitable for local subprocess use (Claude Desktop, Cursor, mcp-cli, etc.).
 */
export const serveStdio = async (config: Config, options: StdioServeOptions = {}): Promise<void> => {
  const server = buildSdkServer(config, options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  options.onReady?.();
};
