import { defineTool } from '@mcify/core';
import { rateLimit, requireAuth, withTimeout } from '@mcify/core/middleware';
import { KhipuClient } from '../client.js';
import { sessionFromContext, type KhipuSessionStore } from '../sessions.js';
import { paymentLinkInputSchema, paymentLinkResultSchema } from '../types-payment.js';

export const createKhipuCreatePaymentLinkTool = (sessions: KhipuSessionStore) =>
  defineTool({
    name: 'khipu_create_payment_link',
    description:
      'Create a Khipu payment link the merchant can share with a customer (typical case: PyME ' +
      'sends the link by WhatsApp). Returns the URL the payer opens to pay via Chilean banks. ' +
      'Use the `vendor.khipu` field for advanced behaviour (force a bank, mandatory payment ' +
      'method, email reminders).',
    middlewares: [
      requireAuth({ message: 'khipu_create_payment_link requires authentication' }),
      // 30/min: cobrar es alto valor pero no se hace masivamente desde un agente.
      rateLimit({ max: 30, windowMs: 60_000 }),
      withTimeout({ ms: 8_000 }),
    ],
    input: paymentLinkInputSchema,
    output: paymentLinkResultSchema,
    handler: async (input, ctx) => {
      const session = await sessionFromContext(sessions, ctx);
      const client = new KhipuClient({ apiKey: session.apiKey });
      return client.createPayment(input);
    },
  });
