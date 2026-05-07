import { defineTool } from '@mcify/core';
import { rateLimit, requireAuth, withTimeout } from '@mcify/core/middleware';
import { z } from 'zod';
import { SimpleFacturaClient } from '../client.js';
import { buildRequestDTE, mapInvoiceDataToResult } from '../builders.js';
import {
  resolveCredenciales,
  sessionFromContext,
  type SimpleFacturaSession,
  type SimpleFacturaSessionStore,
} from '../sessions.js';
import { dteInputSchema, dteResultSchema } from '../types-dte.js';

const inputSchema = dteInputSchema.extend({
  userKey: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Stable identifier for which empresa within the org should emit. ' +
        "Defaults to the org's defaultUserKey when set.",
    ),
});

const empresaForUserKey = (
  session: SimpleFacturaSession,
  userKey?: string,
): { empresa: NonNullable<SimpleFacturaSession['empresas'][string]>; effectiveKey: string } => {
  const effectiveKey = userKey ?? session.defaultUserKey;
  if (!effectiveKey) {
    throw new Error(
      `No userKey provided and no default empresa is set for org "${session.orgId}".`,
    );
  }
  const empresa = session.empresas[effectiveKey];
  if (!empresa) {
    throw new Error(`No empresa bound under userKey "${effectiveKey}" in org "${session.orgId}".`);
  }
  return { empresa, effectiveKey };
};

export const createSimpleFacturaEmitDteTool = (sessions: SimpleFacturaSessionStore) =>
  defineTool({
    name: 'simplefactura_emit_dte',
    description:
      'Emite un Documento Tributario Electrónico (factura, boleta, exenta) en SimpleFactura. ' +
      'El input describe el receptor + items + opciones; el connector arma el shape SII completo ' +
      'y calcula totales. Para Notas de Crédito/Débito usa simplefactura_emit_credit_note.',
    middlewares: [
      requireAuth({ message: 'simplefactura_emit_dte requires authentication' }),
      rateLimit({ max: 30, windowMs: 60_000 }),
      withTimeout({ ms: 15_000 }),
    ],
    input: inputSchema,
    output: dteResultSchema,
    handler: async ({ userKey, ...dteInput }, ctx) => {
      const session = await sessionFromContext(sessions, ctx);
      // Validar credenciales y empresa antes de tocar la red.
      resolveCredenciales(session, userKey);
      const { empresa } = empresaForUserKey(session, userKey);

      const bearerToken = ctx.auth.type === 'bearer' ? ctx.auth.token : '';
      const client = new SimpleFacturaClient({
        email: session.email,
        password: session.password,
        ...(session.cachedToken ? { cachedToken: session.cachedToken } : {}),
        onTokenRefreshed: async (token) => {
          if (bearerToken) await sessions.updateToken(bearerToken, token);
        },
      });

      const requestDTE = buildRequestDTE(dteInput, empresa);
      const sucursalSegment = encodeURIComponent(empresa.nombreSucursal ?? 'default');
      const response = await client.post<
        unknown,
        {
          tipoDTE: number;
          rutEmisor: string;
          rutReceptor: string;
          folio: number;
          fechaEmision: string;
          total: number;
        }
      >(`/invoiceV2/${sucursalSegment}`, requestDTE);

      return mapInvoiceDataToResult(response.data);
    },
  });
