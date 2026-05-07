import path from 'node:path';
import process from 'node:process';
import { bearer, defineConfig } from '@mcify/core';
import { JsonFileMercadoPagoSessionStore } from './src/sessions.js';
import { createMercadoPagoCreatePaymentLinkTool } from './src/tools/create-payment-link.js';
import { createMercadoPagoGetPaymentStatusTool } from './src/tools/get-payment-status.js';
import { createMercadoPagoListPaymentMethodsTool } from './src/tools/list-payment-methods.js';
import { createMercadoPagoRefundPaymentTool } from './src/tools/refund-payment.js';

// Multi-tenant Mercado Pago connector. ONE deploy, MANY merchants.
//
// Each merchant has their own MP access token (from
// https://www.mercadopago.cl/developers → Tus integraciones). The
// connector keeps the mapping `bearer → { orgId, accessToken,
// environment }` server-side; the agent only ever sees its own bearer.
//
// MP separates test/sandbox tokens (TEST-*) from production tokens
// (APP_USR-*). The session declares which one this org uses, so test
// and prod merchants co-exist on the same deploy.
//
// Onboarding (per merchant):
//   1. Merchant creates an integration at mercadopago.cl/developers and
//      copies their access token.
//   2. Operator runs:
//        pnpm admin add-org <orgId> <accessToken> [environment=sandbox|production] [bearer]
//   3. Operator hands the bearer to the merchant; they paste it in
//      Claude Desktop / Cursor config.

const sessionsPath =
  process.env['MERCADOPAGO_SESSIONS_PATH'] ?? path.resolve(process.cwd(), 'sessions.json');
const sessions = new JsonFileMercadoPagoSessionStore(sessionsPath);

export default defineConfig({
  name: 'mercadopago',
  version: '0.1.0',
  description:
    'Mercado Pago (Chile / LATAM) — multi-tenant MCP server for payment links via Preference + ' +
    'Payment APIs. Create, look up, refund payment links; list available payment methods. ' +
    'One deploy serves many merchants; each presents its own bearer token.',
  auth: bearer({
    env: 'MERCADOPAGO_BEARER_ENV_UNUSED',
    verify: async (token) => {
      const session = await sessions.resolveBearer(token);
      return session !== null;
    },
  }),
  tools: [
    createMercadoPagoCreatePaymentLinkTool(sessions),
    createMercadoPagoGetPaymentStatusTool(sessions),
    createMercadoPagoRefundPaymentTool(sessions),
    createMercadoPagoListPaymentMethodsTool(sessions),
  ],
});
