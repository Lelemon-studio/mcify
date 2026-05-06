import { defineTool } from '@mcify/core';
import { rateLimit, requireAuth, withTimeout } from '@mcify/core/middleware';
import { z } from 'zod';
import type { BsaleClient } from '../client.js';

export const createBsaleGetInvoiceTool = (client: BsaleClient) =>
  defineTool({
    name: 'bsale_get_invoice',
    description:
      'Look up a Bsale tax document by its internal id. Returns total, status, and PDF/XML URLs. Use the id returned by bsale_emit_dte or bsale_list_invoices.',
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
      documentTypeId: z.number(),
      status: z.enum(['accepted', 'rejected', 'pending', 'unknown']),
      urlPdf: z.string().url().optional(),
      urlXml: z.string().url().optional(),
    }),
    handler: async ({ id }) => client.getInvoice(id),
  });
