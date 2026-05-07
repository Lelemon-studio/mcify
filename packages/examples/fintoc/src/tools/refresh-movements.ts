import { defineTool } from '@mcify/core';
import { rateLimit, requireAuth, withTimeout } from '@mcify/core/middleware';
import { z } from 'zod';
import { FintocClient } from '../client.js';
import { getLinkToken, sessionFromContext, type FintocSessionStore } from '../sessions.js';

export const createFintocRefreshMovementsTool = (sessions: FintocSessionStore) =>
  defineTool({
    name: 'fintoc_refresh_movements',
    description:
      "Trigger an on-demand refresh of an end-user's bank movements. Fintoc processes " +
      "the refresh asynchronously: the returned status is usually 'created' or " +
      "'in_progress'. Subscribe to refresh_intent.succeeded / .failed webhooks to " +
      'detect completion. Use this when an agent needs to reflect movements that ' +
      "happened minutes ago and haven't yet shown up in fintoc_list_movements.",
    middlewares: [
      requireAuth({ message: 'fintoc_refresh_movements requires authentication' }),
      // Refresh is heavier than reads (Fintoc re-scrapes the bank) — keep it scarce.
      rateLimit({ max: 5, windowMs: 60_000 }),
      withTimeout({ ms: 10_000 }),
    ],
    input: z.object({
      userKey: z
        .string()
        .min(1)
        .describe('Stable identifier for the end-user (resolves to a link_token server-side).'),
    }),
    output: z.object({
      refreshIntentId: z.string(),
      status: z.enum(['created', 'in_progress', 'succeeded', 'failed']),
      createdAt: z.string().optional(),
    }),
    handler: async ({ userKey }, ctx) => {
      const session = await sessionFromContext(sessions, ctx);
      const linkToken = getLinkToken(session, userKey);
      const client = new FintocClient({
        secretKey: session.secretKey,
        ...(session.fintocVersion ? { fintocVersion: session.fintocVersion } : {}),
      });
      const intent = await client.createRefreshIntent(linkToken);
      return {
        refreshIntentId: intent.id,
        status: intent.status,
        ...(intent.createdAt ? { createdAt: intent.createdAt } : {}),
      };
    },
  });
