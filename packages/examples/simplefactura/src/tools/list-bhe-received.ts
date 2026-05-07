import { defineTool } from '@mcify/core';
import { rateLimit, requireAuth, withTimeout } from '@mcify/core/middleware';
import { z } from 'zod';
import { SimpleFacturaClient } from '../client.js';
import {
  resolveCredenciales,
  sessionFromContext,
  type SimpleFacturaSessionStore,
} from '../sessions.js';

const inputSchema = z.object({
  userKey: z.string().min(1).optional(),
  desde: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
    .optional(),
  hasta: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
    .optional(),
  folio: z.number().int().positive().optional(),
});

const bheSchema = z.object({
  folio: z.number().nullable().optional(),
  fechaEmision: z.string().nullable().optional(),
  rutEmisor: z.string().nullable().optional(),
  razonSocialEmisor: z.string().nullable().optional(),
  total: z.number().nullable().optional(),
  retencion: z.number().nullable().optional(),
  liquido: z.number().nullable().optional(),
  estado: z.string().nullable().optional(),
});

const isoDaysAgo = (days: number): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};
const today = (): string => new Date().toISOString().slice(0, 10);

export const createSimpleFacturaListBheReceivedTool = (sessions: SimpleFacturaSessionStore) =>
  defineTool({
    name: 'simplefactura_list_bhe_received',
    description:
      'Lista las Boletas de Honorarios Electrónicas recibidas por la empresa ' +
      '(prestadores de servicios que le facturaron). Filtra por rango de fecha y/o folio.',
    middlewares: [
      requireAuth({ message: 'simplefactura_list_bhe_received requires authentication' }),
      rateLimit({ max: 60, windowMs: 60_000 }),
      withTimeout({ ms: 10_000 }),
    ],
    input: inputSchema,
    output: z.object({ bhes: z.array(bheSchema) }),
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
        Desde: input.desde ?? isoDaysAgo(30),
        Hasta: input.hasta ?? today(),
        ...(input.folio !== undefined ? { Folio: input.folio } : {}),
      };
      const response = await client.post<unknown, Record<string, unknown>[]>('/bhesReceived', body);
      return {
        bhes: (response.data ?? []).map((raw) => ({
          folio: (raw.folio as number | null | undefined) ?? null,
          fechaEmision: (raw.fechaEmision as string | null | undefined) ?? null,
          rutEmisor: (raw.rutEmisor as string | null | undefined) ?? null,
          razonSocialEmisor:
            (raw.razonSocialEmisor as string | null | undefined) ??
            (raw.razonSocialProveedor as string | null | undefined) ??
            null,
          total: (raw.total as number | null | undefined) ?? null,
          retencion: (raw.retencion as number | null | undefined) ?? null,
          liquido: (raw.liquido as number | null | undefined) ?? null,
          estado: (raw.estado as string | null | undefined) ?? null,
        })),
      };
    },
  });
