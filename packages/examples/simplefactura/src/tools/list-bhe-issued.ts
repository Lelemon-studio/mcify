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
    .optional()
    .describe('Default: 30 días atrás.'),
  hasta: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
    .optional()
    .describe('Default: hoy.'),
  folio: z.number().int().positive().optional(),
});

const bheSchema = z.object({
  folio: z.number().nullable().optional(),
  fechaEmision: z.string().nullable().optional(),
  rutReceptor: z.string().nullable().optional(),
  razonSocialReceptor: z.string().nullable().optional(),
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

export const createSimpleFacturaListBheIssuedTool = (sessions: SimpleFacturaSessionStore) =>
  defineTool({
    name: 'simplefactura_list_bhe_issued',
    description:
      'Lista las Boletas de Honorarios Electrónicas emitidas por la empresa. ' +
      'Filtra por rango de fecha y/o folio. Caso típico: freelancer/consultor revisa ' +
      'qué BHE emitió en el mes y cuánto retuvieron.',
    middlewares: [
      requireAuth({ message: 'simplefactura_list_bhe_issued requires authentication' }),
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
      const response = await client.post<unknown, Record<string, unknown>[]>('/bhesIssued', body);
      return { bhes: (response.data ?? []).map(toSummary) };
    },
  });

const toSummary = (raw: Record<string, unknown>) => ({
  folio: (raw.folio as number | null | undefined) ?? null,
  fechaEmision: (raw.fechaEmision as string | null | undefined) ?? null,
  rutReceptor: (raw.rutReceptor as string | null | undefined) ?? null,
  razonSocialReceptor: (raw.razonSocialReceptor as string | null | undefined) ?? null,
  total: (raw.total as number | null | undefined) ?? null,
  retencion: (raw.retencion as number | null | undefined) ?? null,
  liquido: (raw.liquido as number | null | undefined) ?? null,
  estado: (raw.estado as string | null | undefined) ?? null,
});
