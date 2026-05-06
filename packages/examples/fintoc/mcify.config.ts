import { bearer, defineConfig } from '@mcify/core';
import { FintocClient } from './src/client.js';
import { createFintocGetAccountBalanceTool } from './src/tools/get-account-balance.js';
import { createFintocListAccountsTool } from './src/tools/list-accounts.js';
import { createFintocListMovementsTool } from './src/tools/list-movements.js';

// Organization-level secret key. Get one from the Fintoc dashboard
// (Settings → API keys). Use sk_test_ for sandbox, sk_live_ for prod.
const secretKey = process.env['FINTOC_SECRET_KEY'];
if (!secretKey) {
  throw new Error('FINTOC_SECRET_KEY env var is required. Generate one at https://app.fintoc.com');
}

const client = new FintocClient({ secretKey });

export default defineConfig({
  name: 'fintoc',
  version: '0.1.0',
  description:
    'Fintoc (Chile / Mexico) open banking — accounts, balances, and movements as MCP tools.',
  // Bearer token the agent calling this server must present.
  auth: bearer({ env: 'MCIFY_AUTH_TOKEN' }),
  tools: [
    createFintocListAccountsTool(client),
    createFintocGetAccountBalanceTool(client),
    createFintocListMovementsTool(client),
  ],
});
