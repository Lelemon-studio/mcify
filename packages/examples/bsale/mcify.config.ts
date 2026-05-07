import path from 'node:path';
import process from 'node:process';
import { bearer, defineConfig } from '@mcify/core';
import { JsonFileBsaleSessionStore } from './src/sessions.js';
import { createBsaleEmitDteTool } from './src/tools/emit-dte.js';
import { createBsaleGetInvoiceTool } from './src/tools/get-invoice.js';
import { createBsaleListClientsTool } from './src/tools/list-clients.js';
import { createBsaleListInvoicesTool } from './src/tools/list-invoices.js';

// Multi-tenant Bsale connector. ONE deploy, MANY orgs.
//
// Each org (a Bsale-using business) is onboarded separately:
//   1. The org provides their Bsale `access_token` (issued by Bsale).
//   2. You generate a bearer token (`openssl rand -hex 32`).
//   3. You register the binding via the admin CLI:
//        node scripts/admin.mjs add <orgId> <bearerToken> <bsaleToken>
//   4. The org pastes the bearer in their Claude Desktop / Cursor config.
//
// The store keeps the mapping `bearer → { orgId, bsaleAccessToken }`.
// On every request, the runtime resolves the bearer and the handler
// uses the right Bsale token automatically. The org's agent NEVER sees
// the Bsale credential.
//
// For production at scale (many orgs, multi-host), implement
// `BsaleSessionStore` against your DB (Postgres, KV, D1) and swap it
// in below — same shape, persistent storage.

const sessionsPath =
  process.env['BSALE_SESSIONS_PATH'] ?? path.resolve(process.cwd(), 'sessions.json');
const sessions = new JsonFileBsaleSessionStore(sessionsPath);

export default defineConfig({
  name: 'bsale',
  version: '0.2.0',
  description:
    'Bsale (Chile) DTE / facturación electrónica — multi-tenant MCP server. ' +
    'One deploy serves many businesses; each business presents its own bearer token.',
  auth: bearer({
    // The `env` field is required by the bearer() helper but unused here:
    // the verify callback is the source of truth for valid tokens.
    env: 'BSALE_BEARER_ENV_UNUSED',
    verify: async (token) => {
      // Reject unknown / revoked tokens at the boundary. Handlers re-read
      // the session by token to fetch the upstream Bsale credential —
      // that keeps the secret out of the auth envelope and out of any
      // logs that serialize ctx.auth.
      const session = await sessions.resolveBearer(token);
      return session !== null;
    },
  }),
  tools: [
    createBsaleEmitDteTool(sessions),
    createBsaleListInvoicesTool(sessions),
    createBsaleGetInvoiceTool(sessions),
    createBsaleListClientsTool(sessions),
  ],
});
