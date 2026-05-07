import { describe, it, expect, vi } from 'vitest';
import { MemorySimpleFacturaSessionStore } from '../sessions.js';
import { createSimpleFacturaGetDocumentTool } from './get-document.js';

const ok = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const futureIso = (ms: number): string => new Date(Date.now() + ms).toISOString();

describe('simplefactura_get_document', () => {
  it('POSTs /documentIssued with Credenciales + DteReferenciadoExterno', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        ok({
          status: 200,
          data: {
            folio: 1234,
            codigoSii: 33,
            tipoDte: 'Factura Electronica',
            fechaEmision: '2026-05-01',
            rutReceptor: '11.111.111-1',
            razonSocialReceptor: 'Acme SpA',
            neto: 100000,
            iva: 19000,
            total: 119000,
            estadoSII: 'DOK',
            estado: 'aceptado',
            trackId: 9999,
            detalles: [{ NroLinDet: 1, NmbItem: 'X' }],
          },
        }),
      ),
    );

    const sessions = new MemorySimpleFacturaSessionStore();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock;
    try {
      await sessions.add('bearer-1', {
        orgId: 'lelemon',
        email: 'a@b',
        password: 'p',
        cachedToken: { accessToken: 'jwt', expiresAt: futureIso(60 * 60 * 1000) },
      });
      await sessions.addEmpresa('bearer-1', 'main', { rutEmisor: '76.000.000-0' });
      await sessions.setDefault('bearer-1', 'main');

      const tool = createSimpleFacturaGetDocumentTool(sessions);
      const out = await tool.handler(
        { folio: 1234, tipoDTE: 33 },
        // @ts-expect-error minimal context
        { auth: { type: 'bearer', token: 'bearer-1' } },
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe('https://api.simplefactura.cl/documentIssued');
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.Credenciales.RutEmisor).toBe('76.000.000-0');
      expect(body.DteReferenciadoExterno).toEqual({
        Folio: 1234,
        CodigoTipoDte: 33,
        Ambiente: 1,
      });

      expect(out.folio).toBe(1234);
      expect(out.codigoSii).toBe(33);
      expect(out.estadoSII).toBe('DOK');
      expect(out.detalles).toHaveLength(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
