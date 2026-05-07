import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemorySimpleFacturaSessionStore } from '../sessions.js';
import { createSimpleFacturaEmitDteTool } from './emit-dte.js';

const ok = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const futureIso = (ms: number): string => new Date(Date.now() + ms).toISOString();

const setupTool = async (overrideFetch: typeof globalThis.fetch) => {
  const sessions = new MemorySimpleFacturaSessionStore();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = overrideFetch;

  await sessions.add('bearer-1', {
    orgId: 'lelemon',
    email: 'demo@chilesystems.com',
    password: 'Rv8Il4eV',
    cachedToken: { accessToken: 'jwt-cached', expiresAt: futureIso(60 * 60 * 1000) },
  });
  await sessions.addEmpresa('bearer-1', 'main', {
    rutEmisor: '76.000.000-0',
    razonSocial: 'Lelemon Studio SpA',
    giro: 'Servicios de software',
    acteco: [620900],
    nombreSucursal: 'casa-matriz',
  });
  await sessions.setDefault('bearer-1', 'main');

  const tool = createSimpleFacturaEmitDteTool(sessions);
  return {
    sessions,
    tool,
    cleanup: () => {
      globalThis.fetch = originalFetch;
    },
  };
};

describe('simplefactura_emit_dte', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-08T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('POSTs /invoiceV2/{sucursal} with the built RequestDTE and returns the agnostic result', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        ok({
          status: 200,
          data: {
            tipoDTE: 33,
            rutEmisor: '76.000.000-0',
            rutReceptor: '11.111.111-1',
            folio: 1234,
            fechaEmision: '2026-05-08',
            total: 119000,
          },
        }),
      ),
    );

    const { tool, cleanup } = await setupTool(fetchMock);
    try {
      const result = await tool.handler(
        {
          tipoDTE: 33,
          receptor: { rut: '11.111.111-1', razonSocial: 'Acme SpA' },
          items: [{ nombre: 'Consultoría', cantidad: 1, precioUnitario: 100000 }],
        },
        {
          // @ts-expect-error minimal context for handler tests
          auth: { type: 'bearer', token: 'bearer-1' },
        },
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe('https://api.simplefactura.cl/invoiceV2/casa-matriz');
      expect((init as RequestInit).method).toBe('POST');
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.Documento.Encabezado.IdDoc.TipoDTE).toBe(33);
      expect(body.Documento.Encabezado.Emisor.RUTEmisor).toBe('76.000.000-0');
      expect(body.Documento.Encabezado.Receptor.RUTRecep).toBe('11.111.111-1');
      expect(body.Documento.Encabezado.Totales.MntTotal).toBe(119000);

      expect(result).toEqual({
        folio: 1234,
        tipoDTE: 33,
        rutEmisor: '76.000.000-0',
        rutReceptor: '11.111.111-1',
        fechaEmision: '2026-05-08',
        total: 119000,
      });
    } finally {
      cleanup();
    }
  });

  it('throws a clear error when no userKey is provided and no default is set', async () => {
    const sessions = new MemorySimpleFacturaSessionStore();
    await sessions.add('bearer-x', {
      orgId: 'no-default',
      email: 'a@b',
      password: 'p',
    });

    const tool = createSimpleFacturaEmitDteTool(sessions);
    await expect(
      tool.handler(
        {
          tipoDTE: 39,
          receptor: { rut: '1-1', razonSocial: 'X' },
          items: [{ nombre: 'X', cantidad: 1, precioUnitario: 100 }],
        },
        // @ts-expect-error minimal context
        { auth: { type: 'bearer', token: 'bearer-x' } },
      ),
    ).rejects.toThrow(/No userKey provided/);
  });

  it('respects an explicit userKey override (multi-empresa case)', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        ok({
          status: 200,
          data: {
            tipoDTE: 33,
            rutEmisor: '11.111.111-1',
            rutReceptor: '22.222.222-2',
            folio: 1,
            fechaEmision: '2026-05-08',
            total: 1190,
          },
        }),
      ),
    );

    const sessions = new MemorySimpleFacturaSessionStore();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock;
    try {
      await sessions.add('contador-bearer', {
        orgId: 'contador',
        email: 'contador@studio.cl',
        password: 'p',
        cachedToken: { accessToken: 'jwt', expiresAt: futureIso(60 * 60 * 1000) },
      });
      await sessions.addEmpresa('contador-bearer', 'cliente-1', {
        rutEmisor: '11.111.111-1',
        nombreSucursal: 'sede-1',
      });
      await sessions.addEmpresa('contador-bearer', 'cliente-2', {
        rutEmisor: '99.999.999-9',
        nombreSucursal: 'sede-2',
      });

      const tool = createSimpleFacturaEmitDteTool(sessions);
      await tool.handler(
        {
          userKey: 'cliente-1',
          tipoDTE: 33,
          receptor: { rut: '22.222.222-2', razonSocial: 'Cliente del cliente' },
          items: [{ nombre: 'X', cantidad: 1, precioUnitario: 1000 }],
        },
        // @ts-expect-error minimal context
        { auth: { type: 'bearer', token: 'contador-bearer' } },
      );

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe('https://api.simplefactura.cl/invoiceV2/sede-1');
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.Documento.Encabezado.Emisor.RUTEmisor).toBe('11.111.111-1');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
