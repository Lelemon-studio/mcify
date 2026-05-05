import type { AuthState, Config, HandlerContext, Logger } from '@mcify/core';
import { dispatch } from './dispatch.js';
import { buildHandlerContext } from './context.js';

export interface TestClientOptions {
  /** Auth state injected into every call (default: `{ type: 'none' }`). */
  auth?: AuthState;
  /** Logger override (default: silent). */
  logger?: Logger;
}

export interface ToolErrorResult {
  isError: true;
  message: string;
}

const noopLogger: Logger = {
  trace: () => undefined,
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => noopLogger,
};

export interface TestClient {
  /**
   * Invoke a tool by name. Returns the parsed handler result on success.
   *
   * Throws if the tool doesn't exist, params fail validation, the handler
   * throws, or output validation fails. The thrown `Error.message` is what
   * the underlying MCP error response carries.
   */
  invokeTool<T = unknown>(name: string, args?: unknown): Promise<T>;

  /**
   * Read a resource by URI. Static URIs work directly; URI templates are
   * substituted (e.g. `file:///etc/hosts` matches `file:///{path}` with
   * `{ path: 'etc/hosts' }`).
   */
  readResource(uri: string): Promise<{
    mimeType: string;
    text?: string;
    blob?: string;
  }>;

  /**
   * Render a prompt by name. Returns the messages array as defined by the
   * prompt's `render()`.
   */
  getPrompt(
    name: string,
    args?: unknown,
  ): Promise<{
    description?: string;
    messages: { role: 'user' | 'assistant'; content: unknown }[];
  }>;

  /** The current auth state used for each call. */
  readonly auth: AuthState;

  /** Returns a new client with a different auth state. The original is unchanged. */
  withAuth(auth: AuthState): TestClient;
}

let testIdCounter = 0;
const nextTestId = (): string => `test-${(testIdCounter += 1)}`;

const buildClient = (config: Config, options: TestClientOptions = {}): TestClient => {
  const auth = options.auth ?? ({ type: 'none' } as const);
  const ctx = (): HandlerContext =>
    buildHandlerContext({
      auth,
      logger: options.logger ?? noopLogger,
    });

  return {
    auth,

    withAuth: (nextAuth: AuthState) => buildClient(config, { ...options, auth: nextAuth }),

    async invokeTool<T = unknown>(name: string, args: unknown = {}): Promise<T> {
      const response = await dispatch(
        {
          jsonrpc: '2.0',
          id: nextTestId(),
          method: 'tools/call',
          params: { name, arguments: args },
        },
        config,
        ctx(),
      );
      if (!response) throw new Error('test client: dispatch returned no response');
      if ('error' in response) throw new Error(response.error.message);

      const result = response.result as {
        content?: { type: string; text?: string }[];
        isError?: boolean;
      };
      const firstText = result.content?.find((c) => c.type === 'text')?.text;

      if (result.isError) {
        throw new Error(firstText ?? 'tool returned an error');
      }
      // Tool results are JSON.stringify'd into a text content block on the
      // wire — parse back to the user-visible shape.
      if (firstText === undefined) return undefined as T;
      try {
        return JSON.parse(firstText) as T;
      } catch {
        // Some handlers may legitimately return raw strings; pass them through.
        return firstText as T;
      }
    },

    async readResource(uri) {
      const response = await dispatch(
        {
          jsonrpc: '2.0',
          id: nextTestId(),
          method: 'resources/read',
          params: { uri },
        },
        config,
        ctx(),
      );
      if (!response) throw new Error('test client: dispatch returned no response');
      if ('error' in response) throw new Error(response.error.message);
      const first = (
        response.result as { contents?: { mimeType: string; text?: string; blob?: string }[] }
      ).contents?.[0];
      if (!first) throw new Error(`resource ${uri} returned no content`);
      return first;
    },

    async getPrompt(name, args = {}) {
      const response = await dispatch(
        {
          jsonrpc: '2.0',
          id: nextTestId(),
          method: 'prompts/get',
          params: { name, arguments: args },
        },
        config,
        ctx(),
      );
      if (!response) throw new Error('test client: dispatch returned no response');
      if ('error' in response) throw new Error(response.error.message);
      return response.result as {
        description?: string;
        messages: { role: 'user' | 'assistant'; content: unknown }[];
      };
    },
  };
};

/**
 * Build an in-memory test client for a {@link Config}. No HTTP, no stdio —
 * direct dispatch against the config so tests run fast and assert on the
 * exact same code path that production traffic hits.
 *
 * ```ts
 * import { defineConfig, defineTool } from '@mcify/core';
 * import { createTestClient } from '@mcify/runtime/test';
 * import { z } from 'zod';
 *
 * const config = defineConfig({
 *   name: 'demo',
 *   version: '0.1.0',
 *   tools: [
 *     defineTool({
 *       name: 'add',
 *       description: 'add',
 *       input: z.object({ a: z.number(), b: z.number() }),
 *       output: z.object({ sum: z.number() }),
 *       handler: ({ a, b }) => ({ sum: a + b }),
 *     }),
 *   ],
 * });
 *
 * const client = createTestClient(config);
 * const result = await client.invokeTool<{ sum: number }>('add', { a: 2, b: 3 });
 * expect(result).toEqual({ sum: 5 });
 * ```
 */
export const createTestClient = (config: Config, options?: TestClientOptions): TestClient =>
  buildClient(config, options);
