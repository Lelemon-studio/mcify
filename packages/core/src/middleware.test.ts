import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import {
  composeMiddlewares,
  rateLimit,
  requireAuth,
  withTimeout,
  type ToolMiddleware,
} from './middleware.js';
import { defineTool } from './tool.js';
import { createTestCtx } from './_test-utils/ctx.js';

describe('composeMiddlewares', () => {
  it('runs middlewares in declaration order around the handler', async () => {
    const log: string[] = [];
    const mw1: ToolMiddleware = async (input, ctx, next) => {
      log.push('mw1:before');
      const r = await next();
      log.push('mw1:after');
      return r;
    };
    const mw2: ToolMiddleware = async (input, ctx, next) => {
      log.push('mw2:before');
      const r = await next();
      log.push('mw2:after');
      return r;
    };
    const handler = async (): Promise<string> => {
      log.push('handler');
      return 'ok';
    };
    const composed = composeMiddlewares([mw1, mw2], handler);
    const result = await composed({}, createTestCtx());
    expect(result).toBe('ok');
    expect(log).toEqual(['mw1:before', 'mw2:before', 'handler', 'mw2:after', 'mw1:after']);
  });

  it('lets a middleware short-circuit by not calling next()', async () => {
    const handler = vi.fn(async () => 'reached');
    const blocker: ToolMiddleware = async () => 'blocked';
    const composed = composeMiddlewares([blocker], handler);
    const result = await composed({}, createTestCtx());
    expect(result).toBe('blocked');
    expect(handler).not.toHaveBeenCalled();
  });

  it('lets a middleware override the input passed to next()', async () => {
    const captured: unknown[] = [];
    const upper: ToolMiddleware = async (input, ctx, next) => {
      const i = input as { name: string };
      return next({ name: i.name.toUpperCase() });
    };
    const handler = async (input: unknown): Promise<unknown> => {
      captured.push(input);
      return input;
    };
    const composed = composeMiddlewares([upper], handler);
    await composed({ name: 'foo' }, createTestCtx());
    expect(captured).toEqual([{ name: 'FOO' }]);
  });

  it('throws when a middleware calls next() twice', async () => {
    const bad: ToolMiddleware = async (input, ctx, next) => {
      await next();
      await next();
      return 'never';
    };
    const composed = composeMiddlewares([bad], async () => 'x');
    await expect(composed({}, createTestCtx())).rejects.toThrow(/more than once/);
  });

  it('returns the handler directly when there are no middlewares', () => {
    const handler = async (): Promise<string> => 'pass';
    const composed = composeMiddlewares([], handler);
    // Identity check — same reference, no wrapping cost.
    expect(composed).toBe(handler);
  });
});

describe('requireAuth', () => {
  it('passes when default predicate sees a non-none auth state', async () => {
    const tool = defineTool({
      name: 'protected',
      description: 'd',
      input: z.object({}),
      output: z.object({ ok: z.boolean() }),
      middlewares: [requireAuth()],
      handler: () => ({ ok: true }),
    });
    const result = await tool.invoke({}, createTestCtx({ auth: { type: 'bearer', token: 't' } }));
    expect(result).toEqual({ ok: true });
  });

  it('throws when auth.type === none and no override predicate', async () => {
    const tool = defineTool({
      name: 'protected',
      description: 'd',
      input: z.object({}),
      output: z.object({ ok: z.boolean() }),
      middlewares: [requireAuth()],
      handler: () => ({ ok: true }),
    });
    await expect(tool.invoke({}, createTestCtx())).rejects.toThrow(/unauthorized/);
  });

  it('honors a custom predicate', async () => {
    const onlyAlice = requireAuth({
      predicate: (auth) => auth.type === 'bearer' && auth.token === 'alice',
      message: 'only alice',
    });
    const tool = defineTool({
      name: 'protected',
      description: 'd',
      input: z.object({}),
      output: z.object({ ok: z.boolean() }),
      middlewares: [onlyAlice],
      handler: () => ({ ok: true }),
    });
    await expect(
      tool.invoke({}, createTestCtx({ auth: { type: 'bearer', token: 'bob' } })),
    ).rejects.toThrow(/only alice/);
    await expect(
      tool.invoke({}, createTestCtx({ auth: { type: 'bearer', token: 'alice' } })),
    ).resolves.toEqual({ ok: true });
  });
});

describe('rateLimit', () => {
  it('allows up to `max` calls per window then rejects', async () => {
    const limiter = rateLimit({ max: 2, windowMs: 60_000 });
    const tool = defineTool({
      name: 'limited',
      description: 'd',
      input: z.object({}),
      output: z.object({ count: z.number() }),
      middlewares: [limiter],
      handler: () => ({ count: 1 }),
    });
    const ctx = createTestCtx({ auth: { type: 'bearer', token: 'k1' } });
    await tool.invoke({}, ctx);
    await tool.invoke({}, ctx);
    await expect(tool.invoke({}, ctx)).rejects.toThrow(/rate limit/);
  });

  it('separates buckets per key', async () => {
    const limiter = rateLimit({ max: 1, windowMs: 60_000 });
    const tool = defineTool({
      name: 'limited',
      description: 'd',
      input: z.object({}),
      output: z.object({ ok: z.boolean() }),
      middlewares: [limiter],
      handler: () => ({ ok: true }),
    });
    await tool.invoke({}, createTestCtx({ auth: { type: 'bearer', token: 'a' } }));
    await tool.invoke({}, createTestCtx({ auth: { type: 'bearer', token: 'b' } }));
    await expect(
      tool.invoke({}, createTestCtx({ auth: { type: 'bearer', token: 'a' } })),
    ).rejects.toThrow(/rate limit/);
  });

  it('skips limiting when keyBy returns null (e.g. anonymous)', async () => {
    const limiter = rateLimit({ max: 1, windowMs: 60_000 });
    const tool = defineTool({
      name: 'public',
      description: 'd',
      input: z.object({}),
      output: z.object({ ok: z.boolean() }),
      middlewares: [limiter],
      handler: () => ({ ok: true }),
    });
    // Default extractor returns null for `none`; multiple anonymous calls all pass.
    await tool.invoke({}, createTestCtx());
    await tool.invoke({}, createTestCtx());
    await tool.invoke({}, createTestCtx());
  });
});

describe('withTimeout', () => {
  it('rejects with timeout when handler takes longer than ms', async () => {
    const tool = defineTool({
      name: 'slow',
      description: 'd',
      input: z.object({}),
      output: z.object({ ok: z.boolean() }),
      middlewares: [withTimeout({ ms: 20, message: 'too slow' })],
      handler: () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 100)),
    });
    await expect(tool.invoke({}, createTestCtx())).rejects.toThrow(/too slow/);
  });

  it('passes through when handler resolves in time', async () => {
    const tool = defineTool({
      name: 'fast',
      description: 'd',
      input: z.object({}),
      output: z.object({ ok: z.boolean() }),
      middlewares: [withTimeout({ ms: 100 })],
      handler: () => ({ ok: true }),
    });
    await expect(tool.invoke({}, createTestCtx())).resolves.toEqual({ ok: true });
  });
});
