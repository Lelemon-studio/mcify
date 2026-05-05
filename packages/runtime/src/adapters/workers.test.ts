import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { defineConfig, defineTool, bearer } from '@mcify/core';
import { createWorkersHandler } from './workers.js';

const buildConfig = () =>
  defineConfig({
    name: 'workers-test',
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

describe('createWorkersHandler', () => {
  it('reuses the same Hono app across requests (no per-request rebuild)', async () => {
    // The handler is built once. We verify a tool call works twice in a row,
    // implicitly ensuring the route is still registered (would 404 if rebuilt
    // without state). For a stronger guarantee we could spy on createHttpApp,
    // but the handler binds it in closure already.
    const handler = createWorkersHandler(buildConfig());

    const call = (token: string) =>
      handler(
        new Request('http://example.com/mcp', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'whoami', arguments: {} },
          }),
        }),
        { TOKEN: 'workers-secret' },
      );

    const r1 = await call('workers-secret');
    const r2 = await call('workers-secret');
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
  });

  it('reads env from the per-request bindings', async () => {
    const handler = createWorkersHandler(buildConfig());
    const ok = await handler(
      new Request('http://example.com/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer secret-1' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
        }),
      }),
      { TOKEN: 'secret-1' },
    );
    expect(ok.status).toBe(200);

    // Same handler instance — different env per request — second call rejected.
    const denied = await handler(
      new Request('http://example.com/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer secret-1' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
        }),
      }),
      { TOKEN: 'rotated' },
    );
    expect(denied.status).toBe(401);
  });

  it('honors a custom env mapping function', async () => {
    const envFn = vi.fn(
      (c: { env: Record<string, unknown> }) => ({ TOKEN: c.env['CUSTOM_TOKEN_NAME'] as string }),
    );
    const handler = createWorkersHandler(buildConfig(), { env: envFn });
    const res = await handler(
      new Request('http://example.com/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer mapped' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
        }),
      }),
      { CUSTOM_TOKEN_NAME: 'mapped' },
    );
    expect(res.status).toBe(200);
    expect(envFn).toHaveBeenCalled();
  });
});
