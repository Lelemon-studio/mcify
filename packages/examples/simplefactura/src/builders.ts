/**
 * Builders that translate the vendor-agnostic `DteInput` into the
 * SimpleFactura-specific `RequestDTE` shape (which mirrors the SII
 * XML structure).
 *
 * Keeps the LLM-facing schema simple while still producing a valid
 * SII document on the wire.
 */

import type { SimpleFacturaEmpresa } from './sessions.js';
import { calculateItemSubtotal, calculateTotales } from './totales.js';
import type { DteInput, DteResult, DteType } from './types-dte.js';

const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * IndServicio: campo SII para identificar tipo de servicio en boletas.
 * 3 = Boleta de Ventas y Servicios (uso típico).
 */
const indServicioForType = (tipoDTE: DteType): number | undefined => {
  if (tipoDTE === 39 || tipoDTE === 41) return 3;
  return undefined;
};

const formaPagoCodigo = (formaPago: DteInput['formaPago']): number | undefined => {
  switch (formaPago) {
    case 'contado':
      return 1;
    case 'credito':
      return 2;
    case 'sin_costo':
      return 3;
    default:
      return undefined;
  }
};

/** Compose the SimpleFactura `RequestDTE` payload from a `DteInput`. */
export const buildRequestDTE = (input: DteInput, empresa: SimpleFacturaEmpresa): unknown => {
  const totales = calculateTotales(input.tipoDTE, input.items, input.descuentosGlobales);
  const fchEmis = input.fechaEmision ?? today();
  const indServ = indServicioForType(input.tipoDTE);
  const fmaPago = formaPagoCodigo(input.formaPago);

  const documento: Record<string, unknown> = {
    Encabezado: {
      IdDoc: {
        TipoDTE: input.tipoDTE,
        FchEmis: fchEmis,
        ...(indServ !== undefined ? { IndServicio: indServ } : {}),
        ...(fmaPago !== undefined ? { FmaPago: fmaPago } : {}),
      },
      Emisor: buildEmisor(empresa),
      Receptor: buildReceptor(input),
      Totales: {
        MntNeto: totales.montoNeto,
        MntExe: totales.montoExento,
        IVA: totales.iva,
        MntTotal: totales.montoTotal,
      },
    },
    Detalle: input.items.map((item, idx) => ({
      NroLinDet: idx + 1,
      NmbItem: item.nombre,
      QtyItem: item.cantidad,
      PrcItem: item.precioUnitario,
      MontoItem: calculateItemSubtotal(item),
      ...(item.exento ? { IndExe: 1 } : {}),
      ...(item.unidadMedida ? { UnmdItem: item.unidadMedida } : {}),
      ...(item.descuentoPct ? { DescuentoPct: item.descuentoPct, DescuentoMonto: 0 } : {}),
      ...(item.codigoInterno
        ? { CdgItem: [{ TpoCodigo: 'INT1', VlrCodigo: item.codigoInterno }] }
        : {}),
    })),
  };

  if (input.descuentosGlobales && input.descuentosGlobales.length > 0) {
    documento.DscRcgGlobal = input.descuentosGlobales.map((dr, idx) => ({
      NroLinDR: idx + 1,
      TpoMov: dr.tipo,
      TpoValor: dr.expresion,
      ValorDR: dr.valor,
      ...(dr.glosa ? { GlosaDR: dr.glosa } : {}),
    }));
  }

  if (input.referencias && input.referencias.length > 0) {
    documento.Referencia = input.referencias.map((ref, idx) => ({
      NroLinRef: idx + 1,
      TpoDocRef: ref.tipoDoc,
      FolioRef: ref.folio,
      ...(ref.fecha ? { FchRef: ref.fecha } : {}),
      ...(ref.razon ? { RazonRef: ref.razon } : {}),
    }));
  }

  return {
    Documento: documento,
    ...(input.observaciones ? { Observaciones: input.observaciones } : {}),
  };
};

const buildEmisor = (empresa: SimpleFacturaEmpresa): Record<string, unknown> => ({
  RUTEmisor: empresa.rutEmisor,
  ...(empresa.razonSocial ? { RznSoc: empresa.razonSocial } : {}),
  ...(empresa.giro ? { GiroEmis: empresa.giro } : {}),
  ...(empresa.acteco && empresa.acteco.length > 0 ? { Acteco: empresa.acteco } : {}),
  ...(empresa.nombreSucursal ? { Sucursal: empresa.nombreSucursal } : {}),
  ...(empresa.cdgSiiSucursal !== undefined ? { CdgSIISucur: empresa.cdgSiiSucursal } : {}),
  ...(empresa.direccion ? { DirOrigen: empresa.direccion } : {}),
  ...(empresa.comuna ? { CmnaOrigen: empresa.comuna } : {}),
  ...(empresa.ciudad ? { CiudadOrigen: empresa.ciudad } : {}),
});

const buildReceptor = (input: DteInput): Record<string, unknown> => ({
  RUTRecep: input.receptor.rut,
  RznSocRecep: input.receptor.razonSocial,
  ...(input.receptor.giro ? { GiroRecep: input.receptor.giro } : {}),
  ...(input.receptor.direccion ? { DirRecep: input.receptor.direccion } : {}),
  ...(input.receptor.comuna ? { CmnaRecep: input.receptor.comuna } : {}),
  ...(input.receptor.ciudad ? { CiudadRecep: input.receptor.ciudad } : {}),
  ...(input.receptor.email ? { CorreoRecep: input.receptor.email } : {}),
});

/**
 * Map SimpleFactura's `InvoiceData` response to the agnostic `DteResult`.
 * SimpleFactura's response is intentionally minimal — additional fields
 * like estadoSII or pdfUrl come from a separate `obtenerDte` call.
 */
export const mapInvoiceDataToResult = (
  invoice: {
    tipoDTE: number;
    rutEmisor: string;
    rutReceptor: string;
    folio: number;
    fechaEmision: string;
    total: number;
  },
  extras?: { estadoSII?: string; pdfUrl?: string; xmlUrl?: string; trackId?: number },
): DteResult => ({
  folio: invoice.folio,
  tipoDTE: invoice.tipoDTE as DteType,
  rutEmisor: invoice.rutEmisor,
  rutReceptor: invoice.rutReceptor,
  fechaEmision: invoice.fechaEmision,
  total: invoice.total,
  ...(extras?.estadoSII ? { estadoSII: extras.estadoSII } : {}),
  ...(extras?.pdfUrl ? { pdfUrl: extras.pdfUrl } : {}),
  ...(extras?.xmlUrl ? { xmlUrl: extras.xmlUrl } : {}),
  ...(extras?.trackId !== undefined ? { trackId: extras.trackId } : {}),
});
