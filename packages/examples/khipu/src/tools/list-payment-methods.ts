import { defineTool } from '@mcify/core';
import { rateLimit, requireAuth, withTimeout } from '@mcify/core/middleware';
import { z } from 'zod';
import { KhipuClient } from '../client.js';
import { sessionFromContext, type KhipuSessionStore } from '../sessions.js';
import { paymentMethodItemSchema } from '../types-payment.js';

export const createKhipuListPaymentMethodsTool = (sessions: KhipuSessionStore) =>
  defineTool({
    name: 'khipu_list_payment_methods',
    description:
      "List the payment methods enabled on the merchant's Khipu account (simplified transfer, " +
      'normal transfer, Webpay, etc.). Useful when the merchant wants to confirm what the ' +
      'payer will be able to use.',
    middlewares: [
      requireAuth({ message: 'khipu_list_payment_methods requires authentication' }),
      rateLimit({ max: 60, windowMs: 60_000 }),
      withTimeout({ ms: 5_000 }),
    ],
    input: z.object({}),
    output: z.object({ paymentMethods: z.array(paymentMethodItemSchema) }),
    handler: async (_input, ctx) => {
      const session = await sessionFromContext(sessions, ctx);
      const client = new KhipuClient({ apiKey: session.apiKey });
      return { paymentMethods: await client.listPaymentMethods() };
    },
  });
