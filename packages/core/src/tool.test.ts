import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineTool } from './tool.js';
import { McifyValidationError } from './errors.js';
import { createTestCtx } from './_test-utils/ctx.js';

describe('defineTool', () => {
  it('throws when name is missing', () => {
    expect(() =>
      defineTool({
        name: '',
        description: 'd',
        input: z.object({}),
        output: z.object({}),
        handler: () => ({}),
      }),
    ).toThrow(/name/);
  });

  it('throws when name has invalid characters', () => {
    expect(() =>
      defineTool({
        name: 'has spaces',
        description: 'd',
        input: z.object({}),
        output: z.object({}),
        handler: () => ({}),
      }),
    ).toThrow(/invalid name/);
  });

  it('throws when description is missing', () => {
    expect(() =>
      defineTool({
        name: 'tool',
        description: '',
        input: z.object({}),
        output: z.object({}),
        handler: () => ({}),
      }),
    ).toThrow(/description/);
  });

  it('builds inputJsonSchema and outputJsonSchema as JSON Schema 7', () => {
    const t = defineTool({
      name: 'add',
      description: 'add two numbers',
      input: z.object({ a: z.number(), b: z.number() }),
      output: z.object({ sum: z.number() }),
      handler: ({ a, b }) => ({ sum: a + b }),
    });
    expect(t.inputJsonSchema['type']).toBe('object');
    expect((t.inputJsonSchema['properties'] as Record<string, unknown>)['a']).toBeDefined();
    expect(t.outputJsonSchema['type']).toBe('object');
  });

  it('invokes the handler and validates input + output', async () => {
    const t = defineTool({
      name: 'add',
      description: 'add two numbers',
      input: z.object({ a: z.number(), b: z.number() }),
      output: z.object({ sum: z.number() }),
      handler: ({ a, b }) => ({ sum: a + b }),
    });
    const result = await t.invoke({ a: 2, b: 3 }, createTestCtx());
    expect(result).toEqual({ sum: 5 });
  });

  it('throws McifyValidationError when input is invalid', async () => {
    const t = defineTool({
      name: 'add',
      description: 'add two numbers',
      input: z.object({ a: z.number(), b: z.number() }),
      output: z.object({ sum: z.number() }),
      handler: ({ a, b }) => ({ sum: a + b }),
    });
    await expect(t.invoke({ a: 'not a number', b: 3 }, createTestCtx())).rejects.toBeInstanceOf(
      McifyValidationError,
    );
  });

  it('throws McifyValidationError when handler returns invalid output', async () => {
    const t = defineTool({
      name: 'broken',
      description: 'returns bad output',
      input: z.object({}),
      output: z.object({ ok: z.boolean() }),
      // @ts-expect-error intentional violation for test
      handler: () => ({ ok: 'not a boolean' }),
    });
    await expect(t.invoke({}, createTestCtx())).rejects.toMatchObject({
      name: 'McifyValidationError',
      phase: 'output',
    });
  });

  it('handler can be sync or async', async () => {
    const sync = defineTool({
      name: 'sync',
      description: 'sync handler',
      input: z.object({}),
      output: z.object({ v: z.number() }),
      handler: () => ({ v: 1 }),
    });
    const async = defineTool({
      name: 'async_tool',
      description: 'async handler',
      input: z.object({}),
      output: z.object({ v: z.number() }),
      handler: async () => ({ v: 2 }),
    });
    expect(await sync.invoke({}, createTestCtx())).toEqual({ v: 1 });
    expect(await async.invoke({}, createTestCtx())).toEqual({ v: 2 });
  });

  it('exposes handler directly for unit testing without validation', async () => {
    const t = defineTool({
      name: 'noop',
      description: 'd',
      input: z.object({ x: z.number() }),
      output: z.object({ x: z.number() }),
      handler: ({ x }) => ({ x }),
    });
    // handler is the validated wrapper; calling it with already-typed args works
    expect(await t.handler({ x: 42 }, createTestCtx())).toEqual({ x: 42 });
  });

  it('marks the tool with __mcify brand', () => {
    const t = defineTool({
      name: 'brand',
      description: 'd',
      input: z.object({}),
      output: z.object({}),
      handler: () => ({}),
    });
    expect(t.__mcify).toBe('tool');
  });
});
