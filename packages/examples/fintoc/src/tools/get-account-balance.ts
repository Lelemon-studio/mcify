import { defineTool } from '@mcify/core';
import { rateLimit, requireAuth, withTimeout } from '@mcify/core/middleware';
import { z } from 'zod';
import type { FintocClient } from '../client.js';

export const createFintocGetAccountBalanceTool = (client: FintocClient) =>
  defineTool({
    name: 'fintoc_get_account_balance',
    description:
      'Get the current balance of a single Fintoc account. Returns both the available balance (spendable now) and the current balance (including holds). Use fintoc_list_accounts to discover account ids.',
    middlewares: [
      requireAuth({ message: 'fintoc_get_account_balance requires authentication' }),
      rateLimit({ max: 120, windowMs: 60_000 }),
      withTimeout({ ms: 5_000 }),
    ],
    input: z.object({
      linkToken: z.string().min(1).describe('Fintoc link_token from the connection flow.'),
      accountId: z
        .string()
        .min(1)
        .describe('Fintoc account id (returned by fintoc_list_accounts).'),
    }),
    output: z.object({
      accountId: z.string(),
      currency: z.string(),
      available: z.number(),
      current: z.number(),
    }),
    handler: async ({ linkToken, accountId }) => {
      const account = await client.getAccount(linkToken, accountId);
      return {
        accountId: account.id,
        currency: account.currency,
        available: account.balance.available,
        current: account.balance.current,
      };
    },
  });
