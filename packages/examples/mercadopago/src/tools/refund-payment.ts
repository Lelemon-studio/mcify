import { defineTool } from '@mcify/core';
import { rateLimit, requireAuth, withTimeout } from '@mcify/core/middleware';
import { MercadoPagoClient } from '../client.js';
import { sessionFromContext, type MercadoPagoSessionStore } from '../sessions.js';
import { refundInputSchema, refundResultSchema } from '../types-payment.js';

export const createMercadoPagoRefundPaymentTool = (sessions: MercadoPagoSessionStore) =>
  defineTool({
    name: 'mercadopago_refund_payment',
    description:
      'Refund a paid Mercado Pago payment. Accepts either the preference id (the connector ' +
      'resolves the underlying payment) or the MP payment id directly. Pass `amount` for a ' +
      'partial refund; omit for a full refund. The funds return to the original payment ' +
      'method (card, account balance, transfer).',
    middlewares: [
      requireAuth({ message: 'mercadopago_refund_payment requires authentication' }),
      rateLimit({ max: 10, windowMs: 60_000 }),
      withTimeout({ ms: 10_000 }),
    ],
    input: refundInputSchema,
    output: refundResultSchema,
    handler: async ({ paymentId, amount }, ctx) => {
      const session = await sessionFromContext(sessions, ctx);
      const client = new MercadoPagoClient({
        accessToken: session.accessToken,
        preferSandboxInitPoint: session.environment === 'sandbox',
      });
      return client.refundPayment(paymentId, amount);
    },
  });
