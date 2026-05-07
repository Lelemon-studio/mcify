import path from 'node:path';
import process from 'node:process';
import { bearer, defineConfig } from '@mcify/core';
import { JsonFileKhipuSessionStore } from './src/sessions.js';
import { createKhipuCancelPaymentTool } from './src/tools/cancel-payment.js';
import { createKhipuCreatePaymentLinkTool } from './src/tools/create-payment-link.js';
import { createKhipuGetPaymentStatusTool } from './src/tools/get-payment-status.js';
import { createKhipuListBanksTool } from './src/tools/list-banks.js';
import { createKhipuListPaymentMethodsTool } from './src/tools/list-payment-methods.js';
import { createKhipuRefundPaymentTool } from './src/tools/refund-payment.js';

// Multi-tenant Khipu connector. ONE deploy, MANY merchants.
//
// Each merchant has their own Khipu API key (from their merchant
// dashboard at khipu.com). The connector keeps the mapping
// `bearer → { orgId, apiKey, environment }` server-side; the agent
// invoking a tool only ever sees its own bearer.
//
// Khipu separates `dev` and `live` credentials — the session declares
// which one this org uses, so dev orgs and live orgs co-exist on the
// same deploy without risk of cross-mixing.
//
// Onboarding (per merchant):
//   1. Merchant creates a collection account at khipu.com and copies
//      their API key.
//   2. Operator runs:
//        pnpm admin add-org <orgId> <apiKey> [environment=dev|live] [bearer]
//   3. Operator hands the bearer to the merchant; they paste it in
//      Claude Desktop / Cursor config.
//
// Storage: defaults to ./sessions.json (override with KHIPU_SESSIONS_PATH).
// For production at scale, replace `JsonFileKhipuSessionStore` with a
// DB-backed implementation of `KhipuSessionStore`.

const sessionsPath =
  process.env['KHIPU_SESSIONS_PATH'] ?? path.resolve(process.cwd(), 'sessions.json');
const sessions = new JsonFileKhipuSessionStore(sessionsPath);

export default defineConfig({
  name: 'khipu',
  version: '0.2.0',
  description:
    'Khipu (Chile) — multi-tenant MCP server for instant bank-transfer payment links. ' +
    'Create, look up, cancel, and refund payments; list banks and payment methods. ' +
    'One deploy serves many merchants; each presents its own bearer token.',
  auth: bearer({
    env: 'KHIPU_BEARER_ENV_UNUSED',
    verify: async (token) => {
      const session = await sessions.resolveBearer(token);
      return session !== null;
    },
  }),
  tools: [
    createKhipuCreatePaymentLinkTool(sessions),
    createKhipuGetPaymentStatusTool(sessions),
    createKhipuCancelPaymentTool(sessions),
    createKhipuRefundPaymentTool(sessions),
    createKhipuListBanksTool(sessions),
    createKhipuListPaymentMethodsTool(sessions),
  ],
});
