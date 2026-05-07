import { defineTool } from '@mcify/core';
import { rateLimit, requireAuth, withTimeout } from '@mcify/core/middleware';
import { z } from 'zod';
import { BsaleClient } from '../client.js';
import { sessionFromContext, type BsaleSessionStore } from '../sessions.js';

const dteOutput = z.object({
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
});

export const createBsaleListInvoicesTool = (sessions: BsaleSessionStore) =>
  defineTool({
    name: 'bsale_list_invoices',
    description:
      'List Bsale tax documents (DTEs). Filter by date range, document type, or SII code. ' +
      'Useful for "give me all invoices issued last week" or per-document-type counting.',
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
        .describe(
          "Inclusive lower bound on emission date (YYYY-MM-DD). The connector serializes the range as Bsale's `emissiondaterange` query param.",
        ),
      emissionDateTo: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
        .optional()
        .describe('Inclusive upper bound on emission date (YYYY-MM-DD).'),
      documentTypeId: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Filter by Bsale internal document type id.'),
      codeSii: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          'Filter by SII document code (e.g. 33 for factura electrónica, 39 for boleta electrónica). Independent of `documentTypeId`.',
        ),
    }),
    output: z.object({
      invoices: z.array(dteOutput),
    }),
    handler: async (input, ctx) => {
      const session = await sessionFromContext(sessions, ctx);
      const client = new BsaleClient({ accessToken: session.bsaleAccessToken });
      return { invoices: await client.listInvoices(input) };
    },
  });
