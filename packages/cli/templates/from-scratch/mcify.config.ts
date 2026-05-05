import { defineConfig, defineTool } from '@mcify/core';
import { z } from 'zod';

const greet = defineTool({
  name: 'greet',
  description: 'Greet someone by name',
  input: z.object({
    name: z.string().min(1).describe('The name of the person to greet'),
  }),
  output: z.object({
    message: z.string(),
  }),
  handler: ({ name }) => ({
    message: `Hello, ${name}!`,
  }),
});

export default defineConfig({
  name: '{{name}}',
  version: '0.1.0',
  tools: [greet],
});
