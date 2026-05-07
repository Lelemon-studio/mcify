import { defineTool } from '@mcify/core';
import { rateLimit, requireAuth, withTimeout } from '@mcify/core/middleware';
import { z } from 'zod';
import { KhipuClient } from '../client.js';
import { sessionFromContext, type KhipuSessionStore } from '../sessions.js';
import { bankItemSchema } from '../types-payment.js';

export const createKhipuListBanksTool = (sessions: KhipuSessionStore) =>
  defineTool({
    name: 'khipu_list_banks',
    description:
      'List Chilean banks supported by Khipu for this merchant. Useful when the agent wants ' +
      'to confirm a bank is supported or pre-select one (via vendor.khipu.bankId on create).',
    middlewares: [
      requireAuth({ message: 'khipu_list_banks requires authentication' }),
      rateLimit({ max: 60, windowMs: 60_000 }),
      withTimeout({ ms: 5_000 }),
    ],
    input: z.object({}),
    output: z.object({ banks: z.array(bankItemSchema) }),
    handler: async (_input, ctx) => {
      const session = await sessionFromContext(sessions, ctx);
      const client = new KhipuClient({ apiKey: session.apiKey });
      return { banks: await client.listBanks() };
    },
  });
