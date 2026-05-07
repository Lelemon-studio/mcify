import { defineTool } from '@mcify/core';
import { rateLimit, requireAuth, withTimeout } from '@mcify/core/middleware';
import { MercadoPagoClient } from '../client.js';
import { sessionFromContext, type MercadoPagoSessionStore } from '../sessions.js';
import { paymentLinkInputSchema, paymentLinkResultSchema } from '../types-payment.js';

export const createMercadoPagoCreatePaymentLinkTool = (sessions: MercadoPagoSessionStore) =>
  defineTool({
    name: 'mercadopago_create_payment_link',
    description:
      'Create a Mercado Pago payment link the merchant can share with a customer. Returns ' +
      'the URL the payer opens to pay via cards, transfers, or MP wallet. The connector ' +
      'creates a Preference; MP generates a Payment when the customer pays. Use the ' +
      '`vendor.mercadopago` field for advanced behaviour (per-line items, excluded payment ' +
      'methods, installments).',
    middlewares: [
      requireAuth({ message: 'mercadopago_create_payment_link requires authentication' }),
      rateLimit({ max: 30, windowMs: 60_000 }),
      withTimeout({ ms: 8_000 }),
    ],
    input: paymentLinkInputSchema,
    output: paymentLinkResultSchema,
    handler: async (input, ctx) => {
      const session = await sessionFromContext(sessions, ctx);
      const client = new MercadoPagoClient({
        accessToken: session.accessToken,
        preferSandboxInitPoint: session.environment === 'sandbox',
      });
      return client.createPreference(input);
    },
  });
