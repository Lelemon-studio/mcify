import { bearer, defineConfig } from '@mcify/core';
import { BsaleClient } from './src/client.js';
import { createBsaleEmitDteTool } from './src/tools/emit-dte.js';
import { createBsaleGetInvoiceTool } from './src/tools/get-invoice.js';
import { createBsaleListClientsTool } from './src/tools/list-clients.js';
import { createBsaleListInvoicesTool } from './src/tools/list-invoices.js';

// Bsale `access_token` from Configuración → API → "Crear Token".
const accessToken = process.env['BSALE_ACCESS_TOKEN'];
if (!accessToken) {
  throw new Error(
    'BSALE_ACCESS_TOKEN env var is required. Generate one at https://app.bsale.io/configuration/api',
  );
}

const client = new BsaleClient({ accessToken });

export default defineConfig({
  name: 'bsale',
  version: '0.1.0',
  description: 'Bsale (Chile) DTE / facturación electrónica — exposed as MCP tools for AI agents.',
  // Bearer token the agent calling this server must present. Use a long
  // random string in production (`openssl rand -hex 32`).
  auth: bearer({ env: 'MCIFY_AUTH_TOKEN' }),
  tools: [
    createBsaleEmitDteTool(client),
    createBsaleListInvoicesTool(client),
    createBsaleGetInvoiceTool(client),
    createBsaleListClientsTool(client),
  ],
});
