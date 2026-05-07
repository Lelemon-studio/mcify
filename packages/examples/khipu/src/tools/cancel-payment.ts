import { defineTool } from '@mcify/core';
import { rateLimit, requireAuth, withTimeout } from '@mcify/core/middleware';
import { z } from 'zod';
import { KhipuClient } from '../client.js';
import { sessionFromContext, type KhipuSessionStore } from '../sessions.js';

export const createKhipuCancelPaymentTool = (sessions: KhipuSessionStore) =>
  defineTool({
    name: 'khipu_cancel_payment',
    description:
      'Cancel a pending Khipu payment link. Useful when the merchant generated a link and ' +
      'changes their mind before the customer pays. Once a payment is `paid`, use ' +
      'khipu_refund_payment instead.',
    middlewares: [
      requireAuth({ message: 'khipu_cancel_payment requires authentication' }),
      rateLimit({ max: 30, windowMs: 60_000 }),
      withTimeout({ ms: 5_000 }),
    ],
    input: z.object({
      paymentId: z.string().min(1).max(64).describe('Khipu payment id to cancel.'),
    }),
    output: z.object({
      paymentId: z.string(),
      cancelled: z.boolean(),
    }),
    handler: async ({ paymentId }, ctx) => {
      const session = await sessionFromContext(sessions, ctx);
      const client = new KhipuClient({ apiKey: session.apiKey });
      return client.cancelPayment(paymentId);
    },
  });
