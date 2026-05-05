import { defineTool, schema } from '@mcify/core';
import { rateLimit, requireAuth, withTimeout } from '@mcify/core/middleware';
import { z } from 'zod';
import type { KhipuClient } from '../client.js';

export const createKhipuGetPaymentStatusTool = (client: KhipuClient) =>
  defineTool({
    name: 'khipu_get_payment_status',
    description:
      'Look up a Khipu payment by id. Returns the current status (pending, done, failed, ...) plus the original subject, currency, amount, and your transaction id if you set one.',
    middlewares: [
      requireAuth({ message: 'khipu_get_payment_status requires authentication' }),
      rateLimit({ max: 120, windowMs: 60_000 }),
      withTimeout({ ms: 5_000 }),
    ],
    input: z.object({
      paymentId: schema.id(64).describe('Khipu payment id, as returned by khipu_create_payment'),
    }),
    output: z.object({
      paymentId: z.string(),
      status: z.enum(['pending', 'verifying', 'done', 'committed', 'failed', 'rejected']),
      statusDetail: z.string().optional(),
      subject: z.string(),
      currency: z.string(),
      amount: z.number(),
      transactionId: z.string().optional(),
      receiptUrl: z.string().url().optional(),
      pictureUrl: z.string().url().optional(),
    }),
    handler: async ({ paymentId }) => client.getPayment(paymentId),
  });
