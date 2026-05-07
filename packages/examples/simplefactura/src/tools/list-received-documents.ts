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
    .describe('Default: 30 días atrás.'),
  hasta: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
    .optional()
    .describe('Default: hoy.'),
  tipoDTE: dteTypeSchema.optional(),
  folio: z.number().int().positive().optional(),
  ambiente: z
    .union([z.literal(0), z.literal(1)])
    .optional()
    .describe('Default: 1.'),
});

const documentSchema = z.object({
  folio: z.number().nullable().optional(),
  codigoSii: z.number(),
  tipoDte: z.string().nullable().optional(),
  fechaEmision: z.string().nullable().optional(),
  rutEmisor: z.string().nullable().optional(),
  razonSocialEmisor: z.string().nullable().optional(),
  total: z.number().nullable().optional(),
  estado: z.string().nullable().optional(),
  estadoAcuse: z.string().nullable().optional(),
});

const isoDaysAgo = (days: number): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};
const today = (): string => new Date().toISOString().slice(0, 10);

export const createSimpleFacturaListReceivedDocumentsTool = (sessions: SimpleFacturaSessionStore) =>
  defineTool({
    name: 'simplefactura_list_received_documents',
    description:
      'Lista los DTEs recibidos por la empresa (compras, gastos). Filtra por rango ' +
      'de fecha, tipo y folio. Caso típico: "¿qué documentos llegaron del SII este mes?"',
    middlewares: [
      requireAuth({ message: 'simplefactura_list_received_documents requires authentication' }),
      rateLimit({ max: 60, windowMs: 60_000 }),
      withTimeout({ ms: 10_000 }),
    ],
    input: inputSchema,
    output: z.object({ documents: z.array(documentSchema) }),
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
        '/documentsReceived',
        body,
      );
      return {
        documents: (response.data ?? []).map((raw) => ({
          folio: (raw.folio as number | null | undefined) ?? null,
          codigoSii: (raw.codigoSii as number | undefined) ?? 0,
          tipoDte: (raw.tipoDte as string | null | undefined) ?? null,
          fechaEmision: (raw.fechaEmision as string | null | undefined) ?? null,
          rutEmisor: (raw.rutProveedor as string | null | undefined) ?? null,
          razonSocialEmisor: (raw.razonSocialProveedor as string | null | undefined) ?? null,
          total: (raw.total as number | null | undefined) ?? null,
          estado: (raw.estado as string | null | undefined) ?? null,
          estadoAcuse: (raw.estadoAcuse as string | null | undefined) ?? null,
        })),
      };
    },
  });
