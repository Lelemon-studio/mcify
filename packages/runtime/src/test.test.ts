import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineConfig, defineResource, defineTool, definePrompt } from '@mcify/core';
import { createTestClient } from './test.js';

const buildConfig = () =>
  defineConfig({
    name: 'test-fixture',
    version: '0.1.0',
    tools: [
      defineTool({
        name: 'add',
        description: 'add',
        input: z.object({ a: z.number(), b: z.number() }),
        output: z.object({ sum: z.number() }),
        handler: ({ a, b }) => ({ sum: a + b }),
      }),
      defineTool({
        name: 'whoami',
        description: 'whoami',
        input: z.object({}),
        output: z.object({ type: z.string() }),
        handler: (_input, ctx) => ({ type: ctx.auth.type }),
      }),
      defineTool({
        name: 'fail',
        description: 'always fails',
        input: z.object({}),
        output: z.object({}),
        handler: () => {
          throw new Error('boom');
        },
      }),
    ],
    resources: [
      defineResource({
        uri: 'config://settings',
        name: 'settings',
        mimeType: 'application/json',
        read: () => ({ mimeType: 'application/json', text: '{"theme":"dark"}' }),
      }),
    ],
    prompts: [
      definePrompt({
        name: 'greet',
        description: 'greet someone',
        arguments: z.object({ who: z.string().min(1) }),
        render: ({ who }) => [{ role: 'user', content: `hello ${who}` }],
      }),
    ],
  });

describe('createTestClient', () => {
  describe('invokeTool', () => {
    it('returns the parsed handler result', async () => {
      const client = createTestClient(buildConfig());
      const result = await client.invokeTool<{ sum: number }>('add', { a: 2, b: 3 });
      expect(result).toEqual({ sum: 5 });
    });

    it('throws when input fails validation', async () => {
      const client = createTestClient(buildConfig());
      await expect(client.invokeTool('add', { a: 'oops', b: 3 })).rejects.toThrow();
    });

    it('throws with the handler error message when the handler throws', async () => {
      const client = createTestClient(buildConfig());
      await expect(client.invokeTool('fail', {})).rejects.toThrow(/boom/);
    });

    it('throws when the tool does not exist', async () => {
      const client = createTestClient(buildConfig());
      await expect(client.invokeTool('does-not-exist', {})).rejects.toThrow(/Tool not found/);
    });

    it('forwards the configured auth state to the handler', async () => {
      const client = createTestClient(buildConfig(), {
        auth: { type: 'bearer', token: 'tk' },
      });
      const result = await client.invokeTool<{ type: string }>('whoami', {});
      expect(result).toEqual({ type: 'bearer' });
    });

    it('withAuth() returns a new client without mutating the original', async () => {
      const original = createTestClient(buildConfig());
      const authed = original.withAuth({ type: 'bearer', token: 't' });
      expect(original.auth.type).toBe('none');
      expect(authed.auth.type).toBe('bearer');
      const a = await original.invokeTool<{ type: string }>('whoami', {});
      const b = await authed.invokeTool<{ type: string }>('whoami', {});
      expect(a.type).toBe('none');
      expect(b.type).toBe('bearer');
    });
  });

  describe('readResource', () => {
    it('reads a static resource', async () => {
      const client = createTestClient(buildConfig());
      const result = await client.readResource('config://settings');
      expect(result).toMatchObject({
        mimeType: 'application/json',
        text: '{"theme":"dark"}',
      });
    });

    it('throws when no resource matches', async () => {
      const client = createTestClient(buildConfig());
      await expect(client.readResource('unknown://x')).rejects.toThrow(/Resource not found/);
    });
  });

  describe('getPrompt', () => {
    it('renders a prompt with arguments', async () => {
      const client = createTestClient(buildConfig());
      const { messages } = await client.getPrompt('greet', { who: 'world' });
      expect(messages).toEqual([{ role: 'user', content: { type: 'text', text: 'hello world' } }]);
    });

    it('throws on validation error', async () => {
      const client = createTestClient(buildConfig());
      await expect(client.getPrompt('greet', { who: '' })).rejects.toThrow();
    });
  });
});
