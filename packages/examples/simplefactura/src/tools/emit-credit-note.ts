import { defineTool } from '@mcify/core';
import { rateLimit, requireAuth, withTimeout } from '@mcify/core/middleware';
import { z } from 'zod';
import { SimpleFacturaClient } from '../client.js';
import { buildRequestDTE, mapInvoiceDataToResult } from '../builders.js';
import {
  sessionFromContext,
  type SimpleFacturaSession,
  type SimpleFacturaSessionStore,
} from '../sessions.js';
import {
  dteItemSchema,
  dteReceptorSchema,
  dteResultSchema,
  reasonCodeSchema,
} from '../types-dte.js';

const REFERENCE_REASON_GLOSS: Record<number, string> = {
  1: 'Anula documento de referencia',
  2: 'Corrige texto del documento de referencia',
  3: 'Corrige montos del documento de referencia',
};

const inputSchema = z.object({
  userKey: z.string().min(1).optional(),
  isDebitNote: z
    .boolean()
    .default(false)
    .describe('false = Nota de Crédito (61), true = Nota de Débito (56).'),
  motivo: reasonCodeSchema.describe(
    'Motivo de la NC/ND: 1=Anula documento, 2=Corrige texto, 3=Corrige montos.',
  ),
  receptor: dteReceptorSchema,
  items: z.array(dteItemSchema).min(1).max(60),
  /** El DTE referenciado (típicamente factura 33 o boleta 39 a anular/corregir). */
  documentoReferenciado: z.object({
    tipoDoc: z
      .number()
      .int()
      .describe('Código SII del documento referenciado (33 = factura, 39 = boleta, etc.).'),
    folio: z.string().min(1),
    fecha: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
      .optional(),
    razon: z
      .string()
      .max(90)
      .optional()
      .describe('Razón explícita. Default: glosa estándar según el motivo.'),
  }),
  fechaEmision: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
    .optional(),
  observaciones: z.string().max(1000).optional(),
});

const empresaForUserKey = (session: SimpleFacturaSession, userKey?: string) => {
  const effectiveKey = userKey ?? session.defaultUserKey;
  if (!effectiveKey) {
    throw new Error(
      `No userKey provided and no default empresa is set for org "${session.orgId}".`,
    );
  }
  const empresa = session.empresas[effectiveKey];
  if (!empresa) {
    throw new Error(`No empresa bound under userKey "${effectiveKey}" in org "${session.orgId}".`);
  }
  return empresa;
};

export const createSimpleFacturaEmitCreditNoteTool = (sessions: SimpleFacturaSessionStore) =>
  defineTool({
    name: 'simplefactura_emit_credit_note',
    description:
      'Emite una Nota de Crédito (61) o Nota de Débito (56) electrónica que referencia ' +
      'un DTE previamente emitido. El connector arma la referencia obligatoria al ' +
      'documento original y aplica el motivo (anula / corrige texto / corrige montos).',
    middlewares: [
      requireAuth({ message: 'simplefactura_emit_credit_note requires authentication' }),
      // Más estricto: las NC/ND tienen peso legal más sensible.
      rateLimit({ max: 15, windowMs: 60_000 }),
      withTimeout({ ms: 15_000 }),
    ],
    input: inputSchema,
    output: dteResultSchema,
    handler: async (input, ctx) => {
      const session = await sessionFromContext(sessions, ctx);
      const empresa = empresaForUserKey(session, input.userKey);

      const tipoDTE = input.isDebitNote ? 56 : 61;
      const razon =
        input.documentoReferenciado.razon ?? REFERENCE_REASON_GLOSS[input.motivo] ?? 'Referencia';

      const bearerToken = ctx.auth.type === 'bearer' ? ctx.auth.token : '';
      const client = new SimpleFacturaClient({
        email: session.email,
        password: session.password,
        ...(session.cachedToken ? { cachedToken: session.cachedToken } : {}),
        onTokenRefreshed: async (token) => {
          if (bearerToken) await sessions.updateToken(bearerToken, token);
        },
      });

      const requestDTE = buildRequestDTE(
        {
          tipoDTE,
          receptor: input.receptor,
          items: input.items,
          ...(input.fechaEmision ? { fechaEmision: input.fechaEmision } : {}),
          ...(input.observaciones ? { observaciones: input.observaciones } : {}),
          referencias: [
            {
              tipoDoc: input.documentoReferenciado.tipoDoc,
              folio: input.documentoReferenciado.folio,
              ...(input.documentoReferenciado.fecha
                ? { fecha: input.documentoReferenciado.fecha }
                : {}),
              razon,
            },
          ],
        },
        empresa,
      );

      const sucursalSegment = encodeURIComponent(empresa.nombreSucursal ?? 'default');
      const response = await client.post<
        unknown,
        {
          tipoDTE: number;
          rutEmisor: string;
          rutReceptor: string;
          folio: number;
          fechaEmision: string;
          total: number;
        }
      >(`/invoiceCreditDebitNotesV2/${sucursalSegment}/${input.motivo}`, requestDTE);

      return mapInvoiceDataToResult(response.data);
    },
  });
