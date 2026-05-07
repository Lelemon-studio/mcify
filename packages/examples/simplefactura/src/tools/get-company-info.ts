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
});

export const createSimpleFacturaGetCompanyInfoTool = (sessions: SimpleFacturaSessionStore) =>
  defineTool({
    name: 'simplefactura_get_company_info',
    description:
      'Devuelve los datos del emisor para la empresa: RUT, razón social, giro, ' +
      'actividades económicas, dirección. Útil cuando el agente quiere confirmar ' +
      'los datos del emisor antes de emitir un DTE o cuando un usuario pregunta ' +
      'por la información tributaria registrada.',
    middlewares: [
      requireAuth({ message: 'simplefactura_get_company_info requires authentication' }),
      rateLimit({ max: 60, windowMs: 60_000 }),
      withTimeout({ ms: 5_000 }),
    ],
    input: inputSchema,
    output: z.object({
      rutEmisor: z.string().nullable().optional(),
      razonSocial: z.string().nullable().optional(),
      giro: z.string().nullable().optional(),
      acteco: z.array(z.number()).optional(),
      direccion: z.string().nullable().optional(),
      comuna: z.string().nullable().optional(),
      ciudad: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
      telefono: z.string().nullable().optional(),
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

      const response = await client.post<typeof credenciales, Record<string, unknown>>(
        '/datosEmpresa',
        credenciales,
      );
      const raw = response.data ?? {};
      return {
        rutEmisor: (raw.rutEmisor as string | null | undefined) ?? credenciales.RutEmisor ?? null,
        razonSocial: (raw.razonSocial as string | null | undefined) ?? null,
        giro: (raw.giro as string | null | undefined) ?? null,
        ...(Array.isArray(raw.acteco) ? { acteco: raw.acteco as number[] } : {}),
        direccion: (raw.direccion as string | null | undefined) ?? null,
        comuna: (raw.comuna as string | null | undefined) ?? null,
        ciudad: (raw.ciudad as string | null | undefined) ?? null,
        email: (raw.email as string | null | undefined) ?? null,
        telefono: (raw.telefono as string | null | undefined) ?? null,
      };
    },
  });
