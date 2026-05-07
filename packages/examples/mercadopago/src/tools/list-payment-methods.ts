import { defineTool } from '@mcify/core';
import { rateLimit, requireAuth, withTimeout } from '@mcify/core/middleware';
import { z } from 'zod';
import { MercadoPagoClient } from '../client.js';
import { sessionFromContext, type MercadoPagoSessionStore } from '../sessions.js';
import { paymentMethodItemSchema } from '../types-payment.js';

export const createMercadoPagoListPaymentMethodsTool = (sessions: MercadoPagoSessionStore) =>
  defineTool({
    name: 'mercadopago_list_payment_methods',
    description:
      "List the payment methods enabled on the merchant's Mercado Pago account (cards, " +
      'transfers, ticket, MP wallet, etc.). Useful when the merchant wants to confirm what ' +
      'the payer can use, or to exclude a method via vendor.mercadopago.excludedPaymentMethods.',
    middlewares: [
      requireAuth({ message: 'mercadopago_list_payment_methods requires authentication' }),
      rateLimit({ max: 60, windowMs: 60_000 }),
      withTimeout({ ms: 5_000 }),
    ],
    input: z.object({}),
    output: z.object({ paymentMethods: z.array(paymentMethodItemSchema) }),
    handler: async (_input, ctx) => {
      const session = await sessionFromContext(sessions, ctx);
      const client = new MercadoPagoClient({ accessToken: session.accessToken });
      return { paymentMethods: await client.listPaymentMethods() };
    },
  });
