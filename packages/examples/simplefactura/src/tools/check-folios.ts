import { defineTool } from '@mcify/core';
import { rateLimit, requireAuth, withTimeout } from '@mcify/core/middleware';
import { z } from 'zod';
import { SimpleFacturaClient } from '../client.js';
import { sessionFromContext, type SimpleFacturaSessionStore } from '../sessions.js';
import { dteTypeSchema } from '../types-dte.js';

const inputSchema = z.object({
  userKey: z.string().min(1).optional(),
  tipoDTE: dteTypeSchema.describe(
    'Tipo de documento (33 = factura, 39 = boleta, 61 = NC, 56 = ND).',
  ),
  ambiente: z
    .union([z.literal(0), z.literal(1)])
    .optional()
    .describe('Default: 1 (Producción).'),
});

export const createSimpleFacturaCheckFoliosTool = (sessions: SimpleFacturaSessionStore) =>
  defineTool({
    name: 'simplefactura_check_folios',
    description:
      'Devuelve cuántos folios disponibles tiene la empresa para emitir un tipo ' +
      'de DTE específico. Si la cantidad es baja, el agente puede sugerir solicitar ' +
      'más folios al SII antes de emitir documentos masivos.',
    middlewares: [
      requireAuth({ message: 'simplefactura_check_folios requires authentication' }),
      rateLimit({ max: 60, windowMs: 60_000 }),
      withTimeout({ ms: 5_000 }),
    ],
    input: inputSchema,
    output: z.object({
      tipoDTE: dteTypeSchema,
      foliosDisponibles: z.number().int().nonnegative(),
      ambiente: z.union([z.literal(0), z.literal(1)]),
    }),
    handler: async (input, ctx) => {
      const session = await sessionFromContext(sessions, ctx);
      const effectiveKey = input.userKey ?? session.defaultUserKey;
      if (!effectiveKey) {
        throw new Error(
          `No userKey provided and no default empresa is set for org "${session.orgId}".`,
        );
      }
      const empresa = session.empresas[effectiveKey];
      if (!empresa) {
        throw new Error(
          `No empresa bound under userKey "${effectiveKey}" in org "${session.orgId}".`,
        );
      }

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
        RutEmpresa: empresa.rutEmisor,
        TipoDTE: input.tipoDTE,
        Ambiente: input.ambiente ?? 1,
      };
      const response = await client.post<unknown, number>('/folios/consultar/disponibles', body);
      return {
        tipoDTE: input.tipoDTE,
        foliosDisponibles: response.data ?? 0,
        ambiente: input.ambiente ?? 1,
      };
    },
  });
