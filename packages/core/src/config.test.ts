import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineConfig } from './config.js';
import { defineTool } from './tool.js';
import { defineResource } from './resource.js';
import { definePrompt } from './prompt.js';
import { bearer } from './auth/bearer.js';

const makeTool = (name: string) =>
  defineTool({
    name,
    description: 'd',
    input: z.object({}),
    output: z.object({}),
    handler: () => ({}),
  });

const makeResource = (uri: string) =>
  defineResource({
    uri,
    name: uri,
    read: () => ({ mimeType: 'text/plain', text: 'x' }),
  });

const makePrompt = (name: string) =>
  definePrompt({
    name,
    render: () => [],
  });

describe('defineConfig', () => {
  it('throws when name is missing', () => {
    expect(() => defineConfig({ name: '', version: '1.0.0' })).toThrow(/name/);
  });

  it('throws when version is missing', () => {
    expect(() => defineConfig({ name: 'mcp', version: '' })).toThrow(/version/);
  });

  it('returns the config with auth, tools, resources, prompts', () => {
    const t = makeTool('hello');
    const r = makeResource('config://x');
    const p = makePrompt('my_prompt');
    const config = defineConfig({
      name: 'demo',
      version: '0.1.0',
      auth: bearer({ env: 'TOKEN' }),
      tools: [t],
      resources: [r],
      prompts: [p],
    });
    expect(config.name).toBe('demo');
    expect(config.tools?.[0]?.name).toBe('hello');
    expect(config.resources?.[0]?.uri).toBe('config://x');
    expect(config.prompts?.[0]?.name).toBe('my_prompt');
    expect(config.auth?.type).toBe('bearer');
  });

  it('rejects duplicate tool names', () => {
    expect(() =>
      defineConfig({
        name: 'demo',
        version: '0.1.0',
        tools: [makeTool('dup'), makeTool('dup')],
      }),
    ).toThrow(/duplicate tool/);
  });

  it('rejects duplicate resource URIs', () => {
    expect(() =>
      defineConfig({
        name: 'demo',
        version: '0.1.0',
        resources: [makeResource('config://x'), makeResource('config://x')],
      }),
    ).toThrow(/duplicate resource/);
  });

  it('rejects duplicate prompt names', () => {
    expect(() =>
      defineConfig({
        name: 'demo',
        version: '0.1.0',
        prompts: [makePrompt('dup'), makePrompt('dup')],
      }),
    ).toThrow(/duplicate prompt/);
  });

  it('returns a frozen object', () => {
    const config = defineConfig({ name: 'demo', version: '0.1.0' });
    expect(Object.isFrozen(config)).toBe(true);
  });
});
