import { defineTool } from '@mcify/core';
import { rateLimit, requireAuth, withTimeout } from '@mcify/core/middleware';
import { KhipuClient } from '../client.js';
import { sessionFromContext, type KhipuSessionStore } from '../sessions.js';
import { refundInputSchema, refundResultSchema } from '../types-payment.js';

export const createKhipuRefundPaymentTool = (sessions: KhipuSessionStore) =>
  defineTool({
    name: 'khipu_refund_payment',
    description:
      'Refund a paid Khipu payment. Pass `amount` to do a partial refund (when supported); omit ' +
      "for a full refund. The funds return to the customer's bank account; expect 1–3 business " +
      'days for the customer to see them.',
    middlewares: [
      requireAuth({ message: 'khipu_refund_payment requires authentication' }),
      // Refunds are sensitive — keep the throttle low.
      rateLimit({ max: 10, windowMs: 60_000 }),
      withTimeout({ ms: 8_000 }),
    ],
    input: refundInputSchema,
    output: refundResultSchema,
    handler: async ({ paymentId, amount }, ctx) => {
      const session = await sessionFromContext(sessions, ctx);
      const client = new KhipuClient({ apiKey: session.apiKey });
      return client.refundPayment(paymentId, amount);
    },
  });
