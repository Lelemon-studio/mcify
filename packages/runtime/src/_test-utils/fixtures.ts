import { z } from 'zod';
import {
  defineConfig,
  definePrompt,
  defineResource,
  defineTool,
  type Config,
} from '@mcify/core';

export const buildSampleConfig = (): Config => {
  const addTool = defineTool({
    name: 'add',
    description: 'Add two numbers',
    input: z.object({ a: z.number(), b: z.number() }),
    output: z.object({ sum: z.number() }),
    handler: ({ a, b }) => ({ sum: a + b }),
  });

  const failingTool = defineTool({
    name: 'fail',
    description: 'Always fails',
    input: z.object({}),
    output: z.object({}),
    handler: () => {
      throw new Error('boom');
    },
  });

  const settingsResource = defineResource({
    uri: 'config://settings',
    name: 'settings',
    mimeType: 'application/json',
    read: () => ({ mimeType: 'application/json', text: '{"theme":"dark"}' }),
  });

  const fileTemplate = defineResource({
    uri: 'file:///{path}',
    name: 'file-by-path',
    params: z.object({ path: z.string() }),
    read: ({ path }) => ({ mimeType: 'text/plain', text: `contents of ${path}` }),
  });

  const greetPrompt = definePrompt({
    name: 'greet',
    description: 'Say hello to someone',
    arguments: z.object({ who: z.string().min(1) }),
    render: ({ who }) => [{ role: 'user', content: `hello ${who}` }],
  });

  return defineConfig({
    name: 'sample-server',
    version: '0.1.0',
    tools: [addTool, failingTool],
    resources: [settingsResource, fileTemplate],
    prompts: [greetPrompt],
  });
};
