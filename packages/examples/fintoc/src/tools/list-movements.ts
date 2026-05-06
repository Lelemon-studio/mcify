import { defineTool } from '@mcify/core';
import { rateLimit, requireAuth, withTimeout } from '@mcify/core/middleware';
import { z } from 'zod';
import type { FintocClient } from '../client.js';

export const createFintocListMovementsTool = (client: FintocClient) =>
  defineTool({
    name: 'fintoc_list_movements',
    description:
      'List bank movements (transactions) for a single Fintoc account. Filter by date range. Returns each movement with amount, date, description, type, and counterparty when available.',
    middlewares: [
      requireAuth({ message: 'fintoc_list_movements requires authentication' }),
      rateLimit({ max: 60, windowMs: 60_000 }),
      withTimeout({ ms: 10_000 }),
    ],
    input: z.object({
      linkToken: z.string().min(1).describe('Fintoc link_token from the connection flow.'),
      accountId: z
        .string()
        .min(1)
        .describe('Fintoc account id (returned by fintoc_list_accounts).'),
      since: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
        .optional()
        .describe('Inclusive lower bound on post date (YYYY-MM-DD).'),
      until: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
        .optional()
        .describe('Inclusive upper bound on post date (YYYY-MM-DD).'),
      perPage: z
        .number()
        .int()
        .positive()
        .max(300)
        .optional()
        .describe('Page size (max 300, defaults to Fintoc default).'),
    }),
    output: z.object({
      movements: z.array(
        z.object({
          id: z.string(),
          amount: z.number(),
          currency: z.string(),
          postDate: z.string(),
          description: z.string(),
          type: z.enum(['transfer', 'deposit', 'cash', 'service_payment', 'other']),
          recipientAccount: z.object({ holderId: z.string(), holderName: z.string() }).optional(),
          pending: z.boolean().optional(),
        }),
      ),
    }),
    handler: async ({ linkToken, accountId, ...params }) => ({
      movements: await client.listMovements(linkToken, accountId, params),
    }),
  });
