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
  /** Bsale's `state`: 0=active, 1=inactive. Lifecycle of the document record. */
  lifecycle: z.enum(['active', 'inactive']),
  /** Bsale's `informedSii`: the actual declaration status with the Chilean SII. */
  siiStatus: z.enum(['correct', 'sent', 'rejected', 'unknown']),
  urlPdf: z.string().url().optional(),
  urlPublicView: z.string().url().optional(),
  urlXml: z.string().url().optional(),
});

export const createBsaleEmitDteTool = (sessions: BsaleSessionStore) =>
  defineTool({
    name: 'bsale_emit_dte',
    description:
      'Emit a Chilean SII tax document (DTE) — factura/boleta electrónica — through Bsale. ' +
      'Returns the issued document with its number, total, SII declaration status, and PDF/XML URLs. ' +
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
          .describe(
            'Issue date (YYYY-MM-DD). Defaults to today on Bsale side. The connector converts to a unix timestamp in GMT.',
          ),
        expirationDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
          .optional()
          .describe('Optional expiration date (YYYY-MM-DD). Useful for cotizaciones / quotes.'),
        officeId: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            'Office id when the merchant has multiple branches. Omit for single-office accounts.',
          ),
        priceListId: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Optional Bsale price list id.'),
        declareSii: z
          .union([z.literal(0), z.literal(1)])
          .optional()
          .describe(
            'Whether to declare the document to SII immediately (1) or keep it as a draft (0). Defaults to 1 server-side.',
          ),
        salesId: z
          .string()
          .max(100)
          .optional()
          .describe(
            'Free-form external reference id. Use it for idempotency tracking (e.g. your own order id).',
          ),
        details: z
          .array(
            z.object({
              variantId: z
                .number()
                .int()
                .positive()
                .optional()
                .describe('Bsale variant id — required when the line refers to a tracked SKU.'),
              netUnitValue: z.number().nonnegative().describe('Net unit price (CLP, no tax).'),
              quantity: z.number().positive().describe('Number of units.'),
              description: z
                .string()
                .max(1000)
                .optional()
                .describe('Free-text line description (Bsale calls this `comment`).'),
              discount: z
                .number()
                .min(0)
                .max(100)
                .optional()
                .describe('Optional discount percentage (0–100).'),
              taxId: z
                .array(z.number().int().positive())
                .optional()
                .describe(
                  'Optional tax ids to apply per line. Empty = use the document type defaults. The connector serializes as Bsale\'s required "[1,2]" string format.',
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
            activity: z.string().optional().describe('Giro tributario.'),
            companyOrPerson: z
              .union([z.literal(0), z.literal(1)])
              .optional()
              .describe('0 = persona, 1 = empresa.'),
          })
          .optional()
          .describe('Inline client. Use this OR clientId, not both.'),
      })
      .refine((v) => Boolean(v.clientId) !== Boolean(v.client), {
        message: 'Provide exactly one of `clientId` or `client`.',
      }),
    output: dteOutput,
    handler: async (input, ctx) => {
      const session = await sessionFromContext(sessions, ctx);
      const client = new BsaleClient({ accessToken: session.bsaleAccessToken });
      return client.emitDte(input);
    },
  });
