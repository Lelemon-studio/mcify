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
  rut: z.string().min(1).describe('RUT del cliente con guión y DV (ej. "11.111.111-1").'),
});

export const createSimpleFacturaGetClientByRutTool = (sessions: SimpleFacturaSessionStore) =>
  defineTool({
    name: 'simplefactura_get_client_by_rut',
    description:
      'Busca un cliente registrado por su RUT. Útil cuando el usuario menciona un cliente ' +
      'por nombre y el agente necesita confirmar si está en el catálogo antes de emitir.',
    middlewares: [
      requireAuth({ message: 'simplefactura_get_client_by_rut requires authentication' }),
      rateLimit({ max: 120, windowMs: 60_000 }),
      withTimeout({ ms: 5_000 }),
    ],
    input: inputSchema,
    output: z
      .object({
        rut: z.string().nullable().optional(),
        razonSocial: z.string().nullable().optional(),
        giro: z.string().nullable().optional(),
        email: z.string().nullable().optional(),
        direccion: z.string().nullable().optional(),
        comuna: z.string().nullable().optional(),
        ciudad: z.string().nullable().optional(),
      })
      .nullable()
      .describe('null cuando el RUT no está en el catálogo de la empresa.'),
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

      const response = await client.post<typeof credenciales, Record<string, unknown> | null>(
        `/clients/${encodeURIComponent(input.rut)}`,
        credenciales,
      );
      const raw = response.data;
      if (!raw) return null;
      return {
        rut: (raw.rut as string | null | undefined) ?? input.rut,
        razonSocial: (raw.razonSocial as string | null | undefined) ?? null,
        giro: (raw.giro as string | null | undefined) ?? null,
        email: (raw.email as string | null | undefined) ?? null,
        direccion: (raw.direccion as string | null | undefined) ?? null,
        comuna: (raw.comuna as string | null | undefined) ?? null,
        ciudad: (raw.ciudad as string | null | undefined) ?? null,
      };
    },
  });
