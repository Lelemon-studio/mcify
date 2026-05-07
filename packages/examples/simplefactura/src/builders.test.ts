import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildRequestDTE, mapInvoiceDataToResult } from './builders.js';
import type { SimpleFacturaEmpresa } from './sessions.js';

const empresa: SimpleFacturaEmpresa = {
  rutEmisor: '76.000.000-0',
  razonSocial: 'Lelemon Studio SpA',
  giro: 'Servicios de software y consultoría',
  acteco: [620900],
  nombreSucursal: 'Casa Matriz',
  direccion: 'Av. Test 123',
  comuna: 'Las Condes',
  ciudad: 'Santiago',
};

describe('buildRequestDTE', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-08T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds a minimal factura electrónica (33) with totales correctos', () => {
    const out = buildRequestDTE(
      {
        tipoDTE: 33,
        receptor: { rut: '11.111.111-1', razonSocial: 'Acme SpA' },
        items: [{ nombre: 'Consultoría', cantidad: 1, precioUnitario: 100000 }],
      },
      empresa,
    ) as { Documento: Record<string, unknown> };

    const enc = (out.Documento as Record<string, Record<string, unknown>>).Encabezado;
    expect((enc.IdDoc as Record<string, unknown>).TipoDTE).toBe(33);
    expect((enc.IdDoc as Record<string, unknown>).FchEmis).toBe('2026-05-08');
    expect((enc.IdDoc as Record<string, unknown>).IndServicio).toBeUndefined();
    expect((enc.Emisor as Record<string, unknown>).RUTEmisor).toBe('76.000.000-0');
    expect((enc.Emisor as Record<string, unknown>).RznSoc).toBe('Lelemon Studio SpA');
    expect((enc.Receptor as Record<string, unknown>).RUTRecep).toBe('11.111.111-1');
    expect((enc.Totales as Record<string, unknown>).MntNeto).toBe(100000);
    expect((enc.Totales as Record<string, unknown>).IVA).toBe(19000);
    expect((enc.Totales as Record<string, unknown>).MntTotal).toBe(119000);
  });

  it('applies IndServicio=3 for boletas (39)', () => {
    const out = buildRequestDTE(
      {
        tipoDTE: 39,
        receptor: { rut: '66666666-6', razonSocial: 'Cliente Final' },
        items: [{ nombre: 'Servicio', cantidad: 1, precioUnitario: 10000 }],
      },
      empresa,
    ) as { Documento: { Encabezado: { IdDoc: Record<string, unknown> } } };

    expect(out.Documento.Encabezado.IdDoc.IndServicio).toBe(3);
  });

  it('respects fechaEmision override', () => {
    const out = buildRequestDTE(
      {
        tipoDTE: 33,
        fechaEmision: '2026-04-01',
        receptor: { rut: '1-1', razonSocial: 'X' },
        items: [{ nombre: 'X', cantidad: 1, precioUnitario: 1000 }],
      },
      empresa,
    ) as { Documento: { Encabezado: { IdDoc: Record<string, unknown> } } };

    expect(out.Documento.Encabezado.IdDoc.FchEmis).toBe('2026-04-01');
  });

  it('emits IndExe=1 for items marked as exento inside an afecta document', () => {
    const out = buildRequestDTE(
      {
        tipoDTE: 33,
        receptor: { rut: '1-1', razonSocial: 'X' },
        items: [
          { nombre: 'Afecto', cantidad: 1, precioUnitario: 10000 },
          { nombre: 'Exento', cantidad: 1, precioUnitario: 5000, exento: true },
        ],
      },
      empresa,
    ) as { Documento: { Detalle: Record<string, unknown>[] } };

    expect(out.Documento.Detalle[0]?.IndExe).toBeUndefined();
    expect(out.Documento.Detalle[1]?.IndExe).toBe(1);
  });

  it('serialises descuentos globales as DscRcgGlobal entries', () => {
    const out = buildRequestDTE(
      {
        tipoDTE: 33,
        receptor: { rut: '1-1', razonSocial: 'X' },
        items: [{ nombre: 'X', cantidad: 1, precioUnitario: 10000 }],
        descuentosGlobales: [{ tipo: 'D', expresion: '%', valor: 10, glosa: 'Promo' }],
      },
      empresa,
    ) as { Documento: { DscRcgGlobal: Record<string, unknown>[] } };

    expect(out.Documento.DscRcgGlobal).toEqual([
      { NroLinDR: 1, TpoMov: 'D', TpoValor: '%', ValorDR: 10, GlosaDR: 'Promo' },
    ]);
  });

  it('serialises referencias for NC/ND scenarios', () => {
    const out = buildRequestDTE(
      {
        tipoDTE: 61,
        receptor: { rut: '1-1', razonSocial: 'X' },
        items: [{ nombre: 'Anulación', cantidad: 1, precioUnitario: 0 }],
        referencias: [{ tipoDoc: 33, folio: '1234', fecha: '2026-04-30', razon: 'Anula factura' }],
      },
      empresa,
    ) as { Documento: { Referencia: Record<string, unknown>[] } };

    expect(out.Documento.Referencia).toEqual([
      {
        NroLinRef: 1,
        TpoDocRef: 33,
        FolioRef: '1234',
        FchRef: '2026-04-30',
        RazonRef: 'Anula factura',
      },
    ]);
  });

  it('forwards observaciones at the top level', () => {
    const out = buildRequestDTE(
      {
        tipoDTE: 33,
        receptor: { rut: '1-1', razonSocial: 'X' },
        items: [{ nombre: 'X', cantidad: 1, precioUnitario: 1000 }],
        observaciones: 'Pago en 30 días',
      },
      empresa,
    ) as { Observaciones: string };

    expect(out.Observaciones).toBe('Pago en 30 días');
  });

  it('omits emisor optional fields when not present in empresa', () => {
    const minimalEmpresa: SimpleFacturaEmpresa = { rutEmisor: '76.000.000-0' };
    const out = buildRequestDTE(
      {
        tipoDTE: 33,
        receptor: { rut: '1-1', razonSocial: 'X' },
        items: [{ nombre: 'X', cantidad: 1, precioUnitario: 1000 }],
      },
      minimalEmpresa,
    ) as { Documento: { Encabezado: { Emisor: Record<string, unknown> } } };

    const emisor = out.Documento.Encabezado.Emisor;
    expect(emisor.RUTEmisor).toBe('76.000.000-0');
    expect(emisor.RznSoc).toBeUndefined();
    expect(emisor.GiroEmis).toBeUndefined();
    expect(emisor.Acteco).toBeUndefined();
  });
});

describe('mapInvoiceDataToResult', () => {
  it('maps the SimpleFactura InvoiceData onto the agnostic DteResult', () => {
    const result = mapInvoiceDataToResult({
      tipoDTE: 33,
      rutEmisor: '76.000.000-0',
      rutReceptor: '11.111.111-1',
      folio: 1234,
      fechaEmision: '2026-05-08',
      total: 119000,
    });
    expect(result).toEqual({
      folio: 1234,
      tipoDTE: 33,
      rutEmisor: '76.000.000-0',
      rutReceptor: '11.111.111-1',
      fechaEmision: '2026-05-08',
      total: 119000,
    });
  });

  it('includes optional extras when provided', () => {
    const result = mapInvoiceDataToResult(
      {
        tipoDTE: 33,
        rutEmisor: '1-1',
        rutReceptor: '2-2',
        folio: 1,
        fechaEmision: '2026-05-08',
        total: 1000,
      },
      { estadoSII: 'DOK', pdfUrl: 'https://x/y.pdf', trackId: 42 },
    );
    expect(result.estadoSII).toBe('DOK');
    expect(result.pdfUrl).toBe('https://x/y.pdf');
    expect(result.trackId).toBe(42);
  });
});
