import { defineTool } from '@mcify/core';
import { rateLimit, requireAuth, withTimeout } from '@mcify/core/middleware';
import { z } from 'zod';
import { FintocClient } from '../client.js';
import { getLinkToken, sessionFromContext, type FintocSessionStore } from '../sessions.js';

export const createFintocListAccountsTool = (sessions: FintocSessionStore) =>
  defineTool({
    name: 'fintoc_list_accounts',
    description:
      'List all bank accounts visible through a Fintoc link for a given end-user. ' +
      'Identify the user by `userKey` — the connector resolves the actual link_token ' +
      'server-side. Returns each account with id, holder, currency, and balances ' +
      '(integers in the smallest currency unit: CLP whole pesos, MXN cents).',
    middlewares: [
      requireAuth({ message: 'fintoc_list_accounts requires authentication' }),
      rateLimit({ max: 60, windowMs: 60_000 }),
      withTimeout({ ms: 8_000 }),
    ],
    input: z.object({
      userKey: z
        .string()
        .min(1)
        .describe(
          'Stable identifier for the end-user whose accounts to query (e.g. their RUT or your internal user id). The connector maps this to the actual Fintoc link_token.',
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
    handler: async ({ userKey }, ctx) => {
      const session = await sessionFromContext(sessions, ctx);
      const linkToken = getLinkToken(session, userKey);
      const client = new FintocClient({
        secretKey: session.secretKey,
        ...(session.fintocVersion ? { fintocVersion: session.fintocVersion } : {}),
      });
      return { accounts: await client.listAccounts(linkToken) };
    },
  });
