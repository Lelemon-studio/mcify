import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemorySimpleFacturaSessionStore } from '../sessions.js';
import { createSimpleFacturaListDocumentsTool } from './list-documents.js';

const ok = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const futureIso = (ms: number): string => new Date(Date.now() + ms).toISOString();

describe('simplefactura_list_documents', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-08T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('POSTs /documentsIssued with Credenciales + filtros, defaults 30 days', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        ok({
          status: 200,
          data: [
            {
              folio: 1234,
              tipoDte: 'Factura Electronica',
              codigoSii: 33,
              fechaEmision: '2026-05-01',
              rutReceptor: '11.111.111-1',
              razonSocialReceptor: 'Acme SpA',
              total: 119000,
              neto: 100000,
              iva: 19000,
              estadoSII: 'DOK',
              estado: 'aceptado',
              trackId: 9999,
            },
          ],
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

      const tool = createSimpleFacturaListDocumentsTool(sessions);
      const out = await tool.handler(
        {},
        // @ts-expect-error minimal context
        { auth: { type: 'bearer', token: 'bearer-1' } },
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe('https://api.simplefactura.cl/documentsIssued');
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.Credenciales.RutEmisor).toBe('76.000.000-0');
      expect(body.Ambiente).toBe(1);
      expect(body.Hasta).toBe('2026-05-08');
      // 30 días atrás
      expect(body.Desde).toBe('2026-04-08');

      expect(out.documents).toHaveLength(1);
      expect(out.documents[0]?.folio).toBe(1234);
      expect(out.documents[0]?.codigoSii).toBe(33);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('forwards explicit filtros when given', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(ok({ status: 200, data: [] })));

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

      const tool = createSimpleFacturaListDocumentsTool(sessions);
      await tool.handler(
        { desde: '2026-01-01', hasta: '2026-01-31', tipoDTE: 33, folio: 42, ambiente: 0 },
        // @ts-expect-error minimal context
        { auth: { type: 'bearer', token: 'bearer-1' } },
      );

      const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
      expect(body.Desde).toBe('2026-01-01');
      expect(body.Hasta).toBe('2026-01-31');
      expect(body.CodigoTipoDte).toBe(33);
      expect(body.Folio).toBe(42);
      expect(body.Ambiente).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
