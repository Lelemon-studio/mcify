import { bearer, defineConfig } from '@mcify/core';
import { createUser } from './src/tools/create-user.js';
import { getUser } from './src/tools/get-user.js';

export default defineConfig({
  name: '{{name}}',
  version: '0.1.0',
  description: 'MCP server with Zod schemas centralized in src/schemas.ts.',
  // Bearer auth — agent must present `MCIFY_AUTH_TOKEN`. Generate a long
  // random one in production: `openssl rand -hex 32`. Drop the line below
  // for an unauthenticated dev server.
  auth: bearer({ env: 'MCIFY_AUTH_TOKEN' }),
  tools: [createUser, getUser],
});
