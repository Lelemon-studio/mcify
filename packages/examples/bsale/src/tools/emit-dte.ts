import { defineTool } from '@mcify/core';
import { rateLimit, requireAuth, withTimeout } from '@mcify/core/middleware';
import { z } from 'zod';
import type { BsaleClient } from '../client.js';

export const createBsaleEmitDteTool = (client: BsaleClient) =>
  defineTool({
    name: 'bsale_emit_dte',
    description:
      'Emit a Chilean SII tax document (DTE) — factura/boleta electrónica — through Bsale. ' +
      'Returns the issued document with its number, total, and PDF/XML URLs. ' +
      'Use bsale_list_clients first if you need an existing clientId; otherwise pass an inline `client` and Bsale will create or match by RUT.',
    middlewares: [
      requireAuth({ message: 'bsale_emit_dte requires authentication' }),
      // Lower rate than reads: emitting a DTE has tax/legal weight.
      rateLimit({ max: 30, windowMs: 60_000 }),
      withTimeout({ ms: 15_000 }),
    ],
    input: z
      .object({
        documentTypeId: z
          .number()
          .int()
          .positive()
          .describe(
            'Bsale internal document type id. Common: 33 = factura electrónica, 39 = boleta electrónica. List options via /v1/document_types.json on Bsale.',
          ),
        emissionDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
          .optional()
          .describe('Issue date (YYYY-MM-DD). Defaults to today on Bsale side.'),
        details: z
          .array(
            z.object({
              netUnitValue: z.number().nonnegative().describe('Net unit price (CLP, no tax)'),
              quantity: z.number().positive().describe('Number of units'),
              description: z
                .string()
                .max(1000)
                .optional()
                .describe('Free-text line description (Bsale calls this `comment`)'),
              variantId: z
                .number()
                .int()
                .positive()
                .optional()
                .describe('Bsale variant id — required when the line refers to a tracked SKU'),
              taxId: z
                .array(z.number().int().positive())
                .optional()
                .describe(
                  'Optional tax ids to apply per line. Empty = use the document type defaults.',
                ),
            }),
          )
          .min(1)
          .describe('Document lines. At least one is required.'),
        clientId: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Existing Bsale client id (use bsale_list_clients to look it up).'),
        client: z
          .object({
            code: z
              .string()
              .min(1)
              .describe('RUT, formatted "11.111.111-1" — Bsale requires the dotted form.'),
            company: z.string().optional(),
            firstName: z.string().optional(),
            lastName: z.string().optional(),
            email: z.string().email().optional(),
            address: z.string().optional(),
            municipality: z.string().optional(),
            city: z.string().optional(),
            activity: z.string().optional().describe('Giro tributario'),
          })
          .optional()
          .describe('Inline client. Use this OR clientId, not both.'),
      })
      .refine((v) => Boolean(v.clientId) !== Boolean(v.client), {
        message: 'Provide exactly one of `clientId` or `client`.',
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
    handler: async (input) => client.emitDte(input),
  });
