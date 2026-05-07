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

const clientSchema = z.object({
  rut: z.string().nullable().optional(),
  razonSocial: z.string().nullable().optional(),
  giro: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  direccion: z.string().nullable().optional(),
  comuna: z.string().nullable().optional(),
  ciudad: z.string().nullable().optional(),
});

export const createSimpleFacturaListClientsTool = (sessions: SimpleFacturaSessionStore) =>
  defineTool({
    name: 'simplefactura_list_clients',
    description:
      'Lista los clientes (receptores) registrados para la empresa. Útil para el agente ' +
      'cuando el usuario pregunta "¿qué clientes tengo registrados?" o necesita un RUT.',
    middlewares: [
      requireAuth({ message: 'simplefactura_list_clients requires authentication' }),
      rateLimit({ max: 60, windowMs: 60_000 }),
      withTimeout({ ms: 8_000 }),
    ],
    input: inputSchema,
    output: z.object({ clients: z.array(clientSchema) }),
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

      const response = await client.post<typeof credenciales, Record<string, unknown>[]>(
        '/clients',
        credenciales,
      );
      return {
        clients: (response.data ?? []).map((raw) => ({
          rut: pickString(raw, 'rut'),
          razonSocial: pickString(raw, 'razonSocial', 'rznSoc'),
          giro: pickString(raw, 'giro', 'giroEmis'),
          email: pickString(raw, 'email', 'correo'),
          direccion: pickString(raw, 'direccion', 'dirRecep'),
          comuna: pickString(raw, 'comuna', 'cmnaRecep'),
          ciudad: pickString(raw, 'ciudad', 'ciudadRecep'),
        })),
      };
    },
  });

const pickString = (raw: Record<string, unknown>, ...keys: string[]): string | null => {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
};
