import { bearer, defineConfig } from '@mcify/core';
import { KhipuClient } from './src/client.js';
import { createKhipuCreatePaymentTool } from './src/tools/create-payment.js';
import { createKhipuGetPaymentStatusTool } from './src/tools/get-payment-status.js';

// The Khipu merchant API key authenticates *us* against Khipu. Get one from
// https://khipu.com/merchant/profile/api → "Crear nueva API Key".
const khipuApiKey = process.env['KHIPU_API_KEY'];
if (!khipuApiKey) {
  throw new Error(
    'KHIPU_API_KEY env var is required. Get one at https://khipu.com/merchant/profile/api',
  );
}

const client = new KhipuClient({ apiKey: khipuApiKey });

export default defineConfig({
  name: 'khipu',
  version: '0.1.0',
  description: 'Khipu (Chile) payment links and status — exposed as MCP tools for AI agents.',
  // The MCP-side auth: the agent calling this server must present a bearer
  // token matching MCIFY_AUTH_TOKEN. Use a long random string in production
  // (`openssl rand -hex 32`).
  auth: bearer({ env: 'MCIFY_AUTH_TOKEN' }),
  tools: [createKhipuCreatePaymentTool(client), createKhipuGetPaymentStatusTool(client)],
});
