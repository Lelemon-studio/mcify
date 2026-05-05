import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { definePrompt } from './prompt.js';
import { McifyValidationError } from './errors.js';
import { createTestCtx } from './_test-utils/ctx.js';

describe('definePrompt', () => {
  it('throws when name is missing', () => {
    expect(() =>
      definePrompt({
        name: '',
        render: () => [],
      }),
    ).toThrow(/name/);
  });

  it('throws when name has invalid characters', () => {
    expect(() =>
      definePrompt({
        name: 'has spaces',
        render: () => [],
      }),
    ).toThrow(/invalid name/);
  });

  it('renders without arguments', async () => {
    const p = definePrompt({
      name: 'hello',
      render: () => [{ role: 'user', content: 'hi' }],
    });
    const messages = await p.render(undefined, createTestCtx());
    expect(messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('validates arguments and renders', async () => {
    const p = definePrompt({
      name: 'summarize',
      arguments: z.object({ topic: z.string().min(1) }),
      render: ({ topic }) => [{ role: 'user', content: `summarize: ${topic}` }],
    });
    const messages = await p.render({ topic: 'mcify' }, createTestCtx());
    expect(messages[0]?.content).toBe('summarize: mcify');
  });

  it('throws McifyValidationError on invalid arguments', async () => {
    const p = definePrompt({
      name: 'summarize',
      arguments: z.object({ topic: z.string().min(1) }),
      render: () => [],
    });
    await expect(p.render({ topic: '' }, createTestCtx())).rejects.toBeInstanceOf(
      McifyValidationError,
    );
  });

  it('exposes argumentsJsonSchema only when arguments are declared', () => {
    const withArgs = definePrompt({
      name: 'with_args',
      arguments: z.object({ x: z.string() }),
      render: () => [],
    });
    const withoutArgs = definePrompt({
      name: 'without_args',
      render: () => [],
    });
    expect(withArgs.argumentsJsonSchema).toBeDefined();
    expect(withoutArgs.argumentsJsonSchema).toBeUndefined();
  });

  it('marks the prompt with __mcify brand', () => {
    const p = definePrompt({ name: 'brand', render: () => [] });
    expect(p.__mcify).toBe('prompt');
  });
});
