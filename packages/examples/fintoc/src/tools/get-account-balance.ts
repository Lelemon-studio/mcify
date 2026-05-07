import { defineTool } from '@mcify/core';
import { rateLimit, requireAuth, withTimeout } from '@mcify/core/middleware';
import { z } from 'zod';
import { FintocClient } from '../client.js';
import { getLinkToken, sessionFromContext, type FintocSessionStore } from '../sessions.js';

export const createFintocGetAccountBalanceTool = (sessions: FintocSessionStore) =>
  defineTool({
    name: 'fintoc_get_account_balance',
    description:
      'Get the current balance of a single Fintoc account for a given end-user. ' +
      'Returns both the available balance (spendable now) and the current balance ' +
      '(including holds). Values are integers in the smallest currency unit. ' +
      'Use fintoc_list_accounts to discover account ids.',
    middlewares: [
      requireAuth({ message: 'fintoc_get_account_balance requires authentication' }),
      rateLimit({ max: 120, windowMs: 60_000 }),
      withTimeout({ ms: 5_000 }),
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
    }),
    output: z.object({
      accountId: z.string(),
      currency: z.string(),
      available: z.number(),
      current: z.number(),
    }),
    handler: async ({ userKey, accountId }, ctx) => {
      const session = await sessionFromContext(sessions, ctx);
      const linkToken = getLinkToken(session, userKey);
      const client = new FintocClient({
        secretKey: session.secretKey,
        ...(session.fintocVersion ? { fintocVersion: session.fintocVersion } : {}),
      });
      const account = await client.getAccount(linkToken, accountId);
      return {
        accountId: account.id,
        currency: account.currency,
        available: account.balance.available,
        current: account.balance.current,
      };
    },
  });
