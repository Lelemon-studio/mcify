import { defineTool } from '@mcify/core';
import { rateLimit, requireAuth, withTimeout } from '@mcify/core/middleware';
import { z } from 'zod';
import { FintocClient } from '../client.js';
import { getLinkToken, sessionFromContext, type FintocSessionStore } from '../sessions.js';

export const createFintocListMovementsTool = (sessions: FintocSessionStore) =>
  defineTool({
    name: 'fintoc_list_movements',
    description:
      'List bank movements (transactions) for a single Fintoc account belonging to a ' +
      'given end-user. Filter by date range. Pagination is automatic — the connector ' +
      "follows Fintoc's `Link` header up to `maxPages`. Amounts are signed integers in " +
      'the smallest currency unit; `senderAccount` appears for inbound movements and ' +
      '`recipientAccount` for outbound.',
    middlewares: [
      requireAuth({ message: 'fintoc_list_movements requires authentication' }),
      rateLimit({ max: 60, windowMs: 60_000 }),
      withTimeout({ ms: 15_000 }),
    ],
    input: z.object({
      userKey: z
        .string()
        .min(1)
        .describe('Stable identifier for the end-user (resolves to a link_token server-side).'),
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
        .describe('Page size (max 300, defaults to Fintoc default of 30).'),
      maxPages: z
        .number()
        .int()
        .positive()
        .max(50)
        .optional()
        .describe(
          'Cap on pages followed via the cursor. Default 10. Raise for deep historical scans; lower for chat-time queries.',
        ),
    }),
    output: z.object({
      movements: z.array(
        z.object({
          id: z.string(),
          amount: z.number(),
          currency: z.string(),
          postDate: z.string(),
          transactionDate: z.string().optional(),
          description: z.string(),
          type: z.enum(['transfer', 'deposit', 'cash', 'service_payment', 'other']),
          recipientAccount: z.object({ holderId: z.string(), holderName: z.string() }).optional(),
          senderAccount: z.object({ holderId: z.string(), holderName: z.string() }).optional(),
          pending: z.boolean().optional(),
        }),
      ),
    }),
    handler: async ({ userKey, accountId, ...params }, ctx) => {
      const session = await sessionFromContext(sessions, ctx);
      const linkToken = getLinkToken(session, userKey);
      const client = new FintocClient({
        secretKey: session.secretKey,
        ...(session.fintocVersion ? { fintocVersion: session.fintocVersion } : {}),
      });
      return {
        movements: await client.listMovements(linkToken, accountId, params),
      };
    },
  });
