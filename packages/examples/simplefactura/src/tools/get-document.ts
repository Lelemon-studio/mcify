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
  folio: z.number().int().positive(),
  tipoDTE: dteTypeSchema,
  ambiente: z
    .union([z.literal(0), z.literal(1)])
    .optional()
    .describe('Default: 1 (Producción).'),
});

export const createSimpleFacturaGetDocumentTool = (sessions: SimpleFacturaSessionStore) =>
  defineTool({
    name: 'simplefactura_get_document',
    description:
      'Recupera un DTE emitido específico por folio + tipo. Devuelve los detalles ' +
      'completos: receptor, items, totales, estado SII, fechas. Útil para confirmar ' +
      'que un documento se emitió correctamente o para mostrar su contenido.',
    middlewares: [
      requireAuth({ message: 'simplefactura_get_document requires authentication' }),
      rateLimit({ max: 120, windowMs: 60_000 }),
      withTimeout({ ms: 8_000 }),
    ],
    input: inputSchema,
    output: z.object({
      folio: z.number().nullable().optional(),
      codigoSii: z.number(),
      tipoDte: z.string().nullable().optional(),
      fechaEmision: z.string().nullable().optional(),
      rutReceptor: z.string().nullable().optional(),
      razonSocialReceptor: z.string().nullable().optional(),
      neto: z.number().nullable().optional(),
      iva: z.number().nullable().optional(),
      exento: z.number().nullable().optional(),
      total: z.number().nullable().optional(),
      estadoSII: z.string().nullable().optional(),
      estado: z.string().nullable().optional(),
      trackId: z.number().nullable().optional(),
      detalles: z.array(z.record(z.unknown())).optional(),
      referencias: z.array(z.record(z.unknown())).optional(),
    }),
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
        DteReferenciadoExterno: {
          Folio: input.folio,
          CodigoTipoDte: input.tipoDTE,
          Ambiente: input.ambiente ?? 1,
        },
      };

      const response = await client.post<unknown, Record<string, unknown>>('/documentIssued', body);
      const raw = response.data ?? {};
      return {
        folio: (raw.folio as number | null | undefined) ?? null,
        codigoSii: (raw.codigoSii as number | undefined) ?? input.tipoDTE,
        tipoDte: (raw.tipoDte as string | null | undefined) ?? null,
        fechaEmision: (raw.fechaEmision as string | null | undefined) ?? null,
        rutReceptor: (raw.rutReceptor as string | null | undefined) ?? null,
        razonSocialReceptor: (raw.razonSocialReceptor as string | null | undefined) ?? null,
        neto: (raw.neto as number | null | undefined) ?? null,
        iva: (raw.iva as number | null | undefined) ?? null,
        exento: (raw.exento as number | null | undefined) ?? null,
        total: (raw.total as number | null | undefined) ?? null,
        estadoSII: (raw.estadoSII as string | null | undefined) ?? null,
        estado: (raw.estado as string | null | undefined) ?? null,
        trackId: (raw.trackId as number | null | undefined) ?? null,
        ...(Array.isArray(raw.detalles)
          ? { detalles: raw.detalles as Record<string, unknown>[] }
          : {}),
        ...(Array.isArray(raw.referencias)
          ? { referencias: raw.referencias as Record<string, unknown>[] }
          : {}),
      };
    },
  });
