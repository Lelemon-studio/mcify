import { defineTool } from '@mcify/core';
import { rateLimit, requireAuth, withTimeout } from '@mcify/core/middleware';
import { z } from 'zod';
import { SimpleFacturaClient } from '../client.js';
import {
  resolveCredenciales,
  sessionFromContext,
  type SimpleFacturaSessionStore,
} from '../sessions.js';
import { dteTypeSchema } from '../types-dte.js';

const inputSchema = z.object({
  userKey: z.string().min(1).optional(),
  desde: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
    .optional()
    .describe('Inclusive lower bound on emission date. Default: 30 días atrás.'),
  hasta: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
    .optional()
    .describe('Inclusive upper bound on emission date. Default: hoy.'),
  tipoDTE: dteTypeSchema
    .optional()
    .describe('Filtrar por tipo (33 = factura, 39 = boleta, 61 = NC, 56 = ND).'),
  folio: z.number().int().positive().optional().describe('Filtrar por folio específico.'),
  ambiente: z
    .union([z.literal(0), z.literal(1)])
    .optional()
    .describe('0 = Certificación, 1 = Producción. Default: 1.'),
});

const documentSummarySchema = z.object({
  folio: z.number().nullable().optional(),
  tipoDte: z.string().nullable().optional(),
  codigoSii: z.number(),
  fechaEmision: z.string().nullable().optional(),
  rutReceptor: z.string().nullable().optional(),
  razonSocialReceptor: z.string().nullable().optional(),
  total: z.number().nullable().optional(),
  neto: z.number().nullable().optional(),
  iva: z.number().nullable().optional(),
  exento: z.number().nullable().optional(),
  estadoSII: z.string().nullable().optional(),
  estado: z.string().nullable().optional(),
  trackId: z.number().nullable().optional(),
});

const isoDaysAgo = (days: number): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};

const today = (): string => new Date().toISOString().slice(0, 10);

export const createSimpleFacturaListDocumentsTool = (sessions: SimpleFacturaSessionStore) =>
  defineTool({
    name: 'simplefactura_list_documents',
    description:
      'Lista los DTEs emitidos por la empresa. Filtra por rango de fecha, tipo y/o folio. ' +
      'Default: últimos 30 días en producción.',
    middlewares: [
      requireAuth({ message: 'simplefactura_list_documents requires authentication' }),
      rateLimit({ max: 60, windowMs: 60_000 }),
      withTimeout({ ms: 10_000 }),
    ],
    input: inputSchema,
    output: z.object({ documents: z.array(documentSummarySchema) }),
    handler: async (input, ctx) => {
      const session = await sessionFromContext(sessions, ctx);
      const credenciales = resolveCredenciales(session, input.userKey);

      const bearerToken = ctx.auth.type === 'bearer' ? ctx.auth.token : '';
      const client = new SimpleFacturaClient({
        email: session.email,
        password: session.password,
        ...(session.cachedToken ? { cachedToken: session.cachedToken } : {}),
        onTokenRefreshed: async (token) => {
          if (bearerToken) await sessions.updateToken(bearerToken, token);
        },
      });

      const body = {
        Credenciales: credenciales,
        Ambiente: input.ambiente ?? 1,
        Desde: input.desde ?? isoDaysAgo(30),
        Hasta: input.hasta ?? today(),
        Salida: 0,
        ...(input.tipoDTE !== undefined ? { CodigoTipoDte: input.tipoDTE } : {}),
        ...(input.folio !== undefined ? { Folio: input.folio } : {}),
      };

      const response = await client.post<unknown, Record<string, unknown>[]>(
        '/documentsIssued',
        body,
      );
      return { documents: (response.data ?? []).map(toSummary) };
    },
  });

const toSummary = (raw: Record<string, unknown>) => ({
  folio: (raw.folio as number | null | undefined) ?? null,
  tipoDte: (raw.tipoDte as string | null | undefined) ?? null,
  codigoSii: (raw.codigoSii as number | undefined) ?? 0,
  fechaEmision: (raw.fechaEmision as string | null | undefined) ?? null,
  rutReceptor: (raw.rutReceptor as string | null | undefined) ?? null,
  razonSocialReceptor: (raw.razonSocialReceptor as string | null | undefined) ?? null,
  total: (raw.total as number | null | undefined) ?? null,
  neto: (raw.neto as number | null | undefined) ?? null,
  iva: (raw.iva as number | null | undefined) ?? null,
  exento: (raw.exento as number | null | undefined) ?? null,
  estadoSII: (raw.estadoSII as string | null | undefined) ?? null,
  estado: (raw.estado as string | null | undefined) ?? null,
  trackId: (raw.trackId as number | null | undefined) ?? null,
});
