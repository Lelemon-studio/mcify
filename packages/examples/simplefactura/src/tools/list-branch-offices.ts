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

const branchSchema = z.object({
  nombre: z.string().nullable().optional(),
  direccion: z.string().nullable().optional(),
  comuna: z.string().nullable().optional(),
  ciudad: z.string().nullable().optional(),
  codigoSii: z.number().nullable().optional(),
});

export const createSimpleFacturaListBranchOfficesTool = (sessions: SimpleFacturaSessionStore) =>
  defineTool({
    name: 'simplefactura_list_branch_offices',
    description:
      'Lista las sucursales registradas para la empresa. Útil cuando el agente ' +
      'necesita confirmar el nombre de la sucursal antes de emitir un DTE multi-sucursal.',
    middlewares: [
      requireAuth({ message: 'simplefactura_list_branch_offices requires authentication' }),
      rateLimit({ max: 60, windowMs: 60_000 }),
      withTimeout({ ms: 5_000 }),
    ],
    input: inputSchema,
    output: z.object({ branches: z.array(branchSchema) }),
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
        '/branchOffices',
        credenciales,
      );
      return {
        branches: (response.data ?? []).map((raw) => ({
          nombre: (raw.nombre as string | null | undefined) ?? null,
          direccion: (raw.direccion as string | null | undefined) ?? null,
          comuna: (raw.comuna as string | null | undefined) ?? null,
          ciudad: (raw.ciudad as string | null | undefined) ?? null,
          codigoSii: (raw.codigoSii as number | null | undefined) ?? null,
        })),
      };
    },
  });
