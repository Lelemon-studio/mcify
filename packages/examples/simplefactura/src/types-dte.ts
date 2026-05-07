/**
 * Shared types for Chilean DTE (Documento Tributario Electrónico).
 *
 * These types are designed to be **vendor-agnostic** — the same shape
 * works against Bsale, SimpleFactura, Nubox, Defontana, etc. Each
 * connector maps from `DteInput` to its vendor's payload, so a tool's
 * input schema is portable across the ecosystem.
 *
 * Eventually these move to `@mcify/dte-chile`. Living inline for now.
 */

import { z } from 'zod';

/**
 * SII document type codes. Subset relevant for chat-driven emission;
 * Guías, exportaciones and other edge types are intentionally out of
 * scope for v1.
 */
export const dteTypeSchema = z.union([
  z.literal(33), // Factura electrónica afecta
  z.literal(34), // Factura electrónica exenta
  z.literal(39), // Boleta electrónica afecta
  z.literal(41), // Boleta electrónica exenta
  z.literal(56), // Nota de débito electrónica
  z.literal(61), // Nota de crédito electrónica
]);
export type DteType = z.infer<typeof dteTypeSchema>;

export const dteReceptorSchema = z.object({
  rut: z.string().min(1).describe('RUT del receptor con guión y DV (ej. "11.111.111-1").'),
  razonSocial: z.string().min(1).max(100).describe('Nombre o razón social del receptor.'),
  giro: z.string().max(80).optional().describe('Giro tributario del receptor.'),
  direccion: z.string().max(70).optional(),
  comuna: z.string().max(20).optional(),
  ciudad: z.string().max(20).optional(),
  email: z.string().email().optional(),
});
export type DteReceptor = z.infer<typeof dteReceptorSchema>;

export const dteItemSchema = z.object({
  nombre: z.string().min(1).max(80).describe('Descripción del ítem.'),
  cantidad: z.number().positive().describe('Cantidad del ítem.'),
  precioUnitario: z.number().nonnegative().describe('Precio unitario en CLP, sin decimales.'),
  descuentoPct: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe('Descuento porcentual aplicado sólo a esta línea (0–100).'),
  exento: z
    .boolean()
    .optional()
    .describe('true si esta línea es exenta de IVA aunque el documento sea afecto.'),
  codigoInterno: z
    .string()
    .max(35)
    .optional()
    .describe('Código interno del ítem (SKU, código del catálogo, etc.).'),
  unidadMedida: z.string().max(4).optional().describe('Unidad de medida (ej. "UN", "KG", "HR").'),
});
export type DteItem = z.infer<typeof dteItemSchema>;

export const dteDescuentoGlobalSchema = z.object({
  tipo: z.enum(['D', 'R']).describe('"D" = descuento, "R" = recargo.'),
  expresion: z.enum(['%', '$']).describe('"%" porcentaje o "$" valor absoluto en CLP.'),
  valor: z.number().nonnegative(),
  glosa: z.string().max(45).optional(),
});
export type DteDescuentoGlobal = z.infer<typeof dteDescuentoGlobalSchema>;

export const dteReferenciaSchema = z.object({
  tipoDoc: z
    .number()
    .int()
    .describe(
      'Código SII del documento referenciado (ej. 33 = factura, 52 = guía despacho, "SET" para set de pruebas).',
    ),
  folio: z.string().min(1),
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
    .optional(),
  razon: z.string().max(90).optional().describe('Razón de la referencia (motivo de NC, etc.).'),
});
export type DteReferencia = z.infer<typeof dteReferenciaSchema>;

/**
 * The vendor-agnostic input for emitting a DTE. Cada connector mapea
 * este shape al payload nativo del vendor.
 */
export const dteInputSchema = z.object({
  tipoDTE: dteTypeSchema.describe(
    '33=Factura, 34=Factura Exenta, 39=Boleta, 41=Boleta Exenta, 56=NotaDebito, 61=NotaCredito',
  ),
  receptor: dteReceptorSchema,
  items: z.array(dteItemSchema).min(1).max(60).describe('Ítems del documento (1 a 60).'),
  fechaEmision: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
    .optional()
    .describe('Fecha de emisión. Default: hoy.'),
  observaciones: z.string().max(1000).optional(),
  formaPago: z
    .enum(['contado', 'credito', 'sin_costo'])
    .optional()
    .describe('Forma de pago. Default: contado para tipoDTE 33/34/39/41.'),
  ambiente: z
    .union([z.literal(0), z.literal(1)])
    .optional()
    .describe('0 = Certificación SII, 1 = Producción. Default: 1.'),
  descuentosGlobales: z.array(dteDescuentoGlobalSchema).max(20).optional(),
  referencias: z.array(dteReferenciaSchema).max(40).optional(),
});
export type DteInput = z.infer<typeof dteInputSchema>;

/**
 * The vendor-agnostic result of emitting a DTE. Each connector maps
 * its native response into this shape.
 */
export const dteResultSchema = z.object({
  folio: z.number().int().positive(),
  tipoDTE: dteTypeSchema,
  rutEmisor: z.string(),
  rutReceptor: z.string(),
  fechaEmision: z.string(),
  total: z.number(),
  estadoSII: z
    .string()
    .optional()
    .describe('Estado de la declaración con el SII (vendor-specific).'),
  pdfUrl: z.string().optional(),
  xmlUrl: z.string().optional(),
  trackId: z.number().optional().describe('Track ID otorgado por el SII si está disponible.'),
});
export type DteResult = z.infer<typeof dteResultSchema>;

export interface DteTotales {
  montoNeto: number;
  montoExento: number;
  iva: number;
  montoTotal: number;
}

/** Códigos SII de motivos de NC/ND comunes. */
export const reasonCodeSchema = z.union([
  z.literal(1), // Anulación
  z.literal(2), // Corrige texto
  z.literal(3), // Corrige montos
]);
export type ReasonCode = z.infer<typeof reasonCodeSchema>;
