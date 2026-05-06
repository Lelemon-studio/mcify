import { defineTool } from '@mcify/core';
import { rateLimit, requireAuth, withTimeout } from '@mcify/core/middleware';
import { z } from 'zod';
import type { BsaleClient } from '../client.js';

export const createBsaleListInvoicesTool = (client: BsaleClient) =>
  defineTool({
    name: 'bsale_list_invoices',
    description:
      'List Bsale tax documents (DTEs). Filter by date range and document type. Useful for "give me all invoices issued last week" or per-document-type counting.',
    middlewares: [
      requireAuth({ message: 'bsale_list_invoices requires authentication' }),
      rateLimit({ max: 120, windowMs: 60_000 }),
      withTimeout({ ms: 8_000 }),
    ],
    input: z.object({
      limit: z
        .number()
        .int()
        .positive()
        .max(50)
        .optional()
        .describe('Page size, max 50. Defaults to Bsale default (~25).'),
      offset: z.number().int().nonnegative().optional().describe('Pagination offset.'),
      emissionDateFrom: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
        .optional()
        .describe('Inclusive lower bound on emission date.'),
      emissionDateTo: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
        .optional()
        .describe('Inclusive upper bound on emission date.'),
      documentTypeId: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Filter by Bsale document type id (e.g. 33 for factura, 39 for boleta).'),
    }),
    output: z.object({
      invoices: z.array(
        z.object({
          id: z.number(),
          number: z.number(),
          emissionDate: z.string(),
          totalAmount: z.number(),
          documentTypeId: z.number(),
          status: z.enum(['accepted', 'rejected', 'pending', 'unknown']),
          urlPdf: z.string().url().optional(),
          urlXml: z.string().url().optional(),
        }),
      ),
    }),
    handler: async (input) => ({ invoices: await client.listInvoices(input) }),
  });
