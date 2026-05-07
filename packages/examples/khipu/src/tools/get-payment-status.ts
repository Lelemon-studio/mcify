import { defineTool } from '@mcify/core';
import { rateLimit, requireAuth, withTimeout } from '@mcify/core/middleware';
import { z } from 'zod';
import { KhipuClient } from '../client.js';
import { sessionFromContext, type KhipuSessionStore } from '../sessions.js';
import { paymentLinkResultSchema } from '../types-payment.js';

export const createKhipuGetPaymentStatusTool = (sessions: KhipuSessionStore) =>
  defineTool({
    name: 'khipu_get_payment_status',
    description:
      'Look up a Khipu payment by id. Returns the portable status (pending, paid, expired, ' +
      'cancelled, failed, refunded), the original subject and amount, and — if paid — when it ' +
      'settled and the receipt URL.',
    middlewares: [
      requireAuth({ message: 'khipu_get_payment_status requires authentication' }),
      rateLimit({ max: 120, windowMs: 60_000 }),
      withTimeout({ ms: 5_000 }),
    ],
    input: z.object({
      paymentId: z
        .string()
        .min(1)
        .max(64)
        .describe('Khipu payment id, as returned by khipu_create_payment_link.'),
    }),
    output: paymentLinkResultSchema,
    handler: async ({ paymentId }, ctx) => {
      const session = await sessionFromContext(sessions, ctx);
      const client = new KhipuClient({ apiKey: session.apiKey });
      return client.getPayment(paymentId);
    },
  });
