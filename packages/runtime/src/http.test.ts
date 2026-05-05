import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineConfig, defineTool, bearer } from '@mcify/core';
import { createHttpHandler } from './http.js';
import { buildSampleConfig } from './_test-utils/fixtures.js';

const post = (handler: (req: Request) => Promise<Response>, body: unknown, headers: Record<string, string> = {}) =>
  handler(
    new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  );

describe('createHttpHandler', () => {
  it('returns 200 + JSON-RPC response on POST /mcp', async () => {
    const handler = createHttpHandler(buildSampleConfig());
    const res = await post(handler, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { result: { tools: unknown[] } };
    expect(json.result.tools.length).toBeGreaterThan(0);
  });

  it('returns 400 on invalid JSON body', async () => {
    const handler = createHttpHandler(buildSampleConfig());
    const res = await handler(
      new Request('http://localhost/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{ not json',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 405 on GET /mcp (SSE planned for Phase B)', async () => {
    const handler = createHttpHandler(buildSampleConfig());
    const res = await handler(new Request('http://localhost/mcp', { method: 'GET' }));
    expect(res.status).toBe(405);
  });

  it('returns 202 (no body) on JSON-RPC notification', async () => {
    const handler = createHttpHandler(buildSampleConfig());
    const res = await post(handler, { jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(res.status).toBe(202);
  });

  it('exposes a health endpoint at /', async () => {
    const handler = createHttpHandler(buildSampleConfig());
    const res = await handler(new Request('http://localhost/', { method: 'GET' }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; server: { name: string } };
    expect(json.ok).toBe(true);
    expect(json.server.name).toBe('sample-server');
  });

  it('runs the full initialize → tools/call cycle', async () => {
    const handler = createHttpHandler(buildSampleConfig());
    const initRes = await post(handler, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
    });
    const initJson = (await initRes.json()) as { result: { protocolVersion: string } };
    expect(typeof initJson.result.protocolVersion).toBe('string');

    const callRes = await post(handler, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'add', arguments: { a: 10, b: 20 } },
    });
    const callJson = (await callRes.json()) as { result: { content: Array<{ text: string }> } };
    expect(JSON.parse(callJson.result.content[0]!.text)).toEqual({ sum: 30 });
  });

  describe('auth', () => {
    const buildProtectedConfig = () =>
      defineConfig({
        name: 'protected',
        version: '0.1.0',
        auth: bearer({ env: 'TOKEN' }),
        tools: [
          defineTool({
            name: 'whoami',
            description: 'returns the auth state',
            input: z.object({}),
            output: z.object({ type: z.string() }),
            handler: (_input, ctx) => ({ type: ctx.auth.type }),
          }),
        ],
      });

    it('rejects with 401 when token is missing', async () => {
      const handler = createHttpHandler(buildProtectedConfig(), { env: { TOKEN: 'secret' } });
      const res = await post(handler, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      });
      expect(res.status).toBe(401);
    });

    it('accepts and forwards auth state to the handler', async () => {
      const handler = createHttpHandler(buildProtectedConfig(), { env: { TOKEN: 'secret' } });
      const res = await post(
        handler,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'whoami', arguments: {} },
        },
        { authorization: 'Bearer secret' },
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as { result: { content: Array<{ text: string }> } };
      expect(JSON.parse(json.result.content[0]!.text)).toEqual({ type: 'bearer' });
    });
  });
});
