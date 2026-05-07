import path from 'node:path';
import process from 'node:process';
import { bearer, defineConfig } from '@mcify/core';
import { JsonFileFintocSessionStore } from './src/sessions.js';
import { createFintocGetAccountBalanceTool } from './src/tools/get-account-balance.js';
import { createFintocListAccountsTool } from './src/tools/list-accounts.js';
import { createFintocListMovementsTool } from './src/tools/list-movements.js';
import { createFintocRefreshMovementsTool } from './src/tools/refresh-movements.js';

// Multi-tenant Fintoc connector. ONE deploy, MANY orgs.
//
// Fintoc has a two-credential auth model:
//   - `secret_key` — org-level (one per Fintoc account, sk_test_/sk_live_).
//   - `link_token` — per-end-user bank connection, issued by the Fintoc
//     widget when the end-user completes the bank linking flow.
//
// Each org is onboarded:
//   1. The org provides their Fintoc `secret_key`.
//   2. You generate a bearer token (`openssl rand -hex 32`).
//   3. Register the org binding:
//        node scripts/admin.mjs add-org --org acme --bearer <tok> --secret-key sk_test_...
//   4. As end-users link their banks (via your widget integration),
//      register the resulting `link_token`s under stable userKeys:
//        node scripts/admin.mjs add-link --bearer <tok> --user 11111111-1 --link-token link_...
//   5. The org pastes the bearer in their Claude Desktop / Cursor config.
//
// The store keeps `bearer → { orgId, secretKey, linkTokens: { userKey → linkToken } }`.
// Tools accept `userKey` as input — the connector resolves the actual
// `link_token` server-side. The agent NEVER sees the credentials.
//
// For production at scale, implement `FintocSessionStore` against your
// DB (Postgres, KV, D1) and swap it in below.

const sessionsPath =
  process.env['FINTOC_SESSIONS_PATH'] ?? path.resolve(process.cwd(), 'sessions.json');
const sessions = new JsonFileFintocSessionStore(sessionsPath);

export default defineConfig({
  name: 'fintoc',
  version: '0.2.0',
  description:
    'Fintoc (Chile / México) open banking — multi-tenant MCP server. ' +
    'Accounts, balances, movements, and on-demand refresh as MCP tools. ' +
    'One deploy serves many businesses; each business presents its own bearer token.',
  auth: bearer({
    // The `env` field is required by the bearer() helper but unused here:
    // the verify callback is the source of truth for valid tokens.
    env: 'FINTOC_BEARER_ENV_UNUSED',
    verify: async (token) => {
      const session = await sessions.resolveBearer(token);
      return session !== null;
    },
  }),
  tools: [
    createFintocListAccountsTool(sessions),
    createFintocGetAccountBalanceTool(sessions),
    createFintocListMovementsTool(sessions),
    createFintocRefreshMovementsTool(sessions),
  ],
});
