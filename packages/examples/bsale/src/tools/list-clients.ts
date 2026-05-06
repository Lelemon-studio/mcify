import { defineTool } from '@mcify/core';
import { rateLimit, requireAuth, withTimeout } from '@mcify/core/middleware';
import { z } from 'zod';
import type { BsaleClient } from '../client.js';

export const createBsaleListClientsTool = (client: BsaleClient) =>
  defineTool({
    name: 'bsale_list_clients',
    description:
      'List Bsale clients. Pass a `query` to filter by RUT (e.g. "11.111.111-1") or email — the server picks the right Bsale field based on shape. Empty query lists the most recent.',
    middlewares: [
      requireAuth({ message: 'bsale_list_clients requires authentication' }),
      rateLimit({ max: 120, windowMs: 60_000 }),
      withTimeout({ ms: 5_000 }),
    ],
    input: z.object({
      query: z
        .string()
        .optional()
        .describe(
          'RUT (with dots, e.g. "11.111.111-1") or email. Sent to Bsale as `code` or `email` filter.',
        ),
    }),
    output: z.object({
      clients: z.array(
        z.object({
          id: z.number(),
          code: z.string(),
          company: z.string().optional(),
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          email: z.string().optional(),
        }),
      ),
    }),
    handler: async ({ query }) => ({ clients: await client.listClients(query) }),
  });
