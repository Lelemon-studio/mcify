import { defineTool, schema } from '@mcify/core';
import { rateLimit, requireAuth, withTimeout } from '@mcify/core/middleware';
import { z } from 'zod';
import type { KhipuClient } from '../client.js';

export const createKhipuCreatePaymentTool = (client: KhipuClient) =>
  defineTool({
    name: 'khipu_create_payment',
    description:
      'Create a Khipu payment link. Returns a payment_url the customer can open to pay via Chilean banks. Use for one-shot charges; no recurring support.',
    middlewares: [
      requireAuth({ message: 'khipu_create_payment requires authentication' }),
      rateLimit({ max: 60, windowMs: 60_000 }),
      withTimeout({ ms: 5_000 }),
    ],
    input: z.object({
      subject: z
        .string()
        .min(1)
        .max(255)
        .describe('Short description shown to the payer (e.g. "Order #1234")'),
      currency: z.enum(['CLP', 'USD']).describe('ISO currency code'),
      amount: z
        .number()
        .positive()
        .describe('Amount in the major unit (e.g. CLP pesos, USD dollars)'),
      transactionId: schema
        .id(64)
        .optional()
        .describe('Your internal id for this payment. Echoed back on webhooks.'),
      body: z.string().max(1000).optional().describe('Longer description for receipts'),
      returnUrl: schema
        .httpUrl()
        .optional()
        .describe('Where to redirect after a successful payment'),
      cancelUrl: schema.httpUrl().optional().describe('Where to redirect if the payer cancels'),
      notifyUrl: schema
        .httpUrl()
        .optional()
        .describe('Webhook URL Khipu will POST status updates to'),
    }),
    output: z.object({
      paymentId: z.string(),
      paymentUrl: z.string().url(),
      simplifiedTransferUrl: z.string().url().optional(),
      appUrl: z.string().optional(),
      readyForTerminal: z.boolean(),
      expiresDate: z.string().optional(),
    }),
    handler: async (input) => client.createPayment(input),
  });
