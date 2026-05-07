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

const productSchema = z.object({
  codigo: z.string().nullable().optional(),
  nombre: z.string().nullable().optional(),
  precio: z.number().nullable().optional(),
  unidadMedida: z.string().nullable().optional(),
  exento: z.boolean().nullable().optional(),
});

export const createSimpleFacturaListProductsTool = (sessions: SimpleFacturaSessionStore) =>
  defineTool({
    name: 'simplefactura_list_products',
    description:
      'Lista los productos / servicios registrados en el catálogo de la empresa. ' +
      'Útil cuando el agente arma una factura/boleta y quiere referenciar productos ' +
      'existentes con sus precios + unidad de medida.',
    middlewares: [
      requireAuth({ message: 'simplefactura_list_products requires authentication' }),
      rateLimit({ max: 60, windowMs: 60_000 }),
      withTimeout({ ms: 8_000 }),
    ],
    input: inputSchema,
    output: z.object({ products: z.array(productSchema) }),
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
        '/products',
        credenciales,
      );
      return {
        products: (response.data ?? []).map((raw) => ({
          codigo: (raw.codigo as string | null | undefined) ?? null,
          nombre: (raw.nombre as string | null | undefined) ?? null,
          precio: (raw.precio as number | null | undefined) ?? null,
          unidadMedida: (raw.unidadMedida as string | null | undefined) ?? null,
          exento: (raw.exento as boolean | null | undefined) ?? null,
        })),
      };
    },
  });
