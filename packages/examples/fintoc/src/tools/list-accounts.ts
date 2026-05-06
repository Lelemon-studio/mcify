import { defineTool } from '@mcify/core';
import { rateLimit, requireAuth, withTimeout } from '@mcify/core/middleware';
import { z } from 'zod';
import type { FintocClient } from '../client.js';

export const createFintocListAccountsTool = (client: FintocClient) =>
  defineTool({
    name: 'fintoc_list_accounts',
    description:
      'List all bank accounts visible through a Fintoc link. The link_token represents one end-user connection. Returns each account with its id, holder, currency, and current/available balance.',
    middlewares: [
      requireAuth({ message: 'fintoc_list_accounts requires authentication' }),
      rateLimit({ max: 60, windowMs: 60_000 }),
      withTimeout({ ms: 8_000 }),
    ],
    input: z.object({
      linkToken: z
        .string()
        .min(1)
        .describe(
          'Fintoc link_token from the connection flow. Identifies which end-user connection to query.',
        ),
    }),
    output: z.object({
      accounts: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          officialName: z.string().optional(),
          number: z.string(),
          holderId: z.string(),
          holderName: z.string(),
          type: z.enum([
            'checking_account',
            'sight_account',
            'savings_account',
            'business_account',
          ]),
          currency: z.string(),
          balance: z.object({ available: z.number(), current: z.number() }),
        }),
      ),
    }),
    handler: async ({ linkToken }) => ({ accounts: await client.listAccounts(linkToken) }),
  });
