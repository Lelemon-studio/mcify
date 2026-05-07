import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemorySimpleFacturaSessionStore } from '../sessions.js';
import { createSimpleFacturaEmitCreditNoteTool } from './emit-credit-note.js';

const ok = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const futureIso = (ms: number): string => new Date(Date.now() + ms).toISOString();

describe('simplefactura_emit_credit_note', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-08T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('POSTs to /invoiceCreditDebitNotesV2/{sucursal}/{motivo} with the obligatory referencia', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        ok({
          status: 200,
          data: {
            tipoDTE: 61,
            rutEmisor: '76.000.000-0',
            rutReceptor: '11.111.111-1',
            folio: 5,
            fechaEmision: '2026-05-08',
            total: 119000,
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
      await sessions.addEmpresa('bearer-1', 'main', {
        rutEmisor: '76.000.000-0',
        nombreSucursal: 'casa-matriz',
      });
      await sessions.setDefault('bearer-1', 'main');

      const tool = createSimpleFacturaEmitCreditNoteTool(sessions);
      const result = await tool.handler(
        {
          isDebitNote: false,
          motivo: 1,
          receptor: { rut: '11.111.111-1', razonSocial: 'Acme SpA' },
          items: [{ nombre: 'Anulación factura 1234', cantidad: 1, precioUnitario: 100000 }],
          documentoReferenciado: {
            tipoDoc: 33,
            folio: '1234',
            fecha: '2026-04-30',
          },
        },
        // @ts-expect-error minimal context
        { auth: { type: 'bearer', token: 'bearer-1' } },
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe('https://api.simplefactura.cl/invoiceCreditDebitNotesV2/casa-matriz/1');
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.Documento.Encabezado.IdDoc.TipoDTE).toBe(61);
      expect(body.Documento.Referencia).toEqual([
        {
          NroLinRef: 1,
          TpoDocRef: 33,
          FolioRef: '1234',
          FchRef: '2026-04-30',
          RazonRef: 'Anula documento de referencia',
        },
      ]);

      expect(result.folio).toBe(5);
      expect(result.tipoDTE).toBe(61);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('uses TipoDTE 56 when isDebitNote=true', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        ok({
          status: 200,
          data: {
            tipoDTE: 56,
            rutEmisor: '76.000.000-0',
            rutReceptor: '11.111.111-1',
            folio: 9,
            fechaEmision: '2026-05-08',
            total: 100,
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
      await sessions.addEmpresa('bearer-1', 'main', {
        rutEmisor: '76.000.000-0',
        nombreSucursal: 'sucursal',
      });
      await sessions.setDefault('bearer-1', 'main');

      const tool = createSimpleFacturaEmitCreditNoteTool(sessions);
      await tool.handler(
        {
          isDebitNote: true,
          motivo: 3,
          receptor: { rut: '11.111.111-1', razonSocial: 'Acme' },
          items: [{ nombre: 'Diferencia precio', cantidad: 1, precioUnitario: 100 }],
          documentoReferenciado: { tipoDoc: 33, folio: '99' },
        },
        // @ts-expect-error minimal context
        { auth: { type: 'bearer', token: 'bearer-1' } },
      );

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toContain('/invoiceCreditDebitNotesV2/sucursal/3');
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.Documento.Encabezado.IdDoc.TipoDTE).toBe(56);
      // Default razon for motivo 3 = "Corrige montos del documento de referencia"
      expect(body.Documento.Referencia[0].RazonRef).toBe(
        'Corrige montos del documento de referencia',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('honours an explicit razon override on the referencia', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        ok({
          status: 200,
          data: {
            tipoDTE: 61,
            rutEmisor: '76.000.000-0',
            rutReceptor: '11.111.111-1',
            folio: 1,
            fechaEmision: '2026-05-08',
            total: 0,
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
      await sessions.addEmpresa('bearer-1', 'main', {
        rutEmisor: '76.000.000-0',
        nombreSucursal: 's',
      });
      await sessions.setDefault('bearer-1', 'main');

      const tool = createSimpleFacturaEmitCreditNoteTool(sessions);
      await tool.handler(
        {
          isDebitNote: false,
          motivo: 2,
          receptor: { rut: '11.111.111-1', razonSocial: 'Acme' },
          items: [{ nombre: 'Texto corregido', cantidad: 1, precioUnitario: 0 }],
          documentoReferenciado: {
            tipoDoc: 33,
            folio: '1',
            razon: 'Corrige nombre razón social del receptor',
          },
        },
        // @ts-expect-error minimal context
        { auth: { type: 'bearer', token: 'bearer-1' } },
      );

      const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
      expect(body.Documento.Referencia[0].RazonRef).toBe(
        'Corrige nombre razón social del receptor',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
