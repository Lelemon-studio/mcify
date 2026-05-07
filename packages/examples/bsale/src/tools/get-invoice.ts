import { defineTool } from '@mcify/core';
import { rateLimit, requireAuth, withTimeout } from '@mcify/core/middleware';
import { z } from 'zod';
import { BsaleClient } from '../client.js';
import { sessionFromContext, type BsaleSessionStore } from '../sessions.js';

export const createBsaleGetInvoiceTool = (sessions: BsaleSessionStore) =>
  defineTool({
    name: 'bsale_get_invoice',
    description:
      'Look up a Bsale tax document by its internal id. Returns the full record including total, ' +
      'document lifecycle (active/inactive), SII declaration status, and PDF/XML URLs. Use the id ' +
      'returned by bsale_emit_dte or bsale_list_invoices.',
    middlewares: [
      requireAuth({ message: 'bsale_get_invoice requires authentication' }),
      rateLimit({ max: 240, windowMs: 60_000 }),
      withTimeout({ ms: 5_000 }),
    ],
    input: z.object({
      id: z.number().int().positive().describe('Bsale internal document id.'),
    }),
    output: z.object({
      id: z.number(),
      number: z.number(),
      emissionDate: z.string(),
      totalAmount: z.number(),
      netAmount: z.number().optional(),
      taxAmount: z.number().optional(),
      documentTypeId: z.number(),
      lifecycle: z.enum(['active', 'inactive']),
      siiStatus: z.enum(['correct', 'sent', 'rejected', 'unknown']),
      urlPdf: z.string().url().optional(),
      urlPublicView: z.string().url().optional(),
      urlXml: z.string().url().optional(),
    }),
    handler: async ({ id }, ctx) => {
      const session = await sessionFromContext(sessions, ctx);
      const client = new BsaleClient({ accessToken: session.bsaleAccessToken });
      return client.getInvoice(id);
    },
  });
