import { defineTool } from '@mcify/core';
import { rateLimit, requireAuth, withTimeout } from '@mcify/core/middleware';
import { z } from 'zod';
import { MercadoPagoClient } from '../client.js';
import { sessionFromContext, type MercadoPagoSessionStore } from '../sessions.js';
import { paymentLinkResultSchema } from '../types-payment.js';

export const createMercadoPagoGetPaymentStatusTool = (sessions: MercadoPagoSessionStore) =>
  defineTool({
    name: 'mercadopago_get_payment_status',
    description:
      'Look up a Mercado Pago payment link by its preference id. Returns the portable ' +
      'status (paid, pending, failed, cancelled, refunded). The connector resolves the ' +
      'underlying MP Payment internally to derive the status — the agent only knows about ' +
      'the preference id.',
    middlewares: [
      requireAuth({ message: 'mercadopago_get_payment_status requires authentication' }),
      rateLimit({ max: 120, windowMs: 60_000 }),
      withTimeout({ ms: 8_000 }),
    ],
    input: z.object({
      paymentId: z
        .string()
        .min(1)
        .max(64)
        .describe(
          'The MP preference id, as returned by mercadopago_create_payment_link. (You can ' +
            'also pass an MP payment id directly if you have it.)',
        ),
    }),
    output: paymentLinkResultSchema,
    handler: async ({ paymentId }, ctx) => {
      const session = await sessionFromContext(sessions, ctx);
      const client = new MercadoPagoClient({
        accessToken: session.accessToken,
        preferSandboxInitPoint: session.environment === 'sandbox',
      });
      return client.getPreference(paymentId);
    },
  });
