/**
 * Cálculo de totales DTE chileno — agnóstico al vendor.
 *
 * Reglas:
 * - Items afectos suman al `montoNeto`. Items exentos suman al `montoExento`.
 * - Si el `tipoDTE` es full-exento (34, 41), TODOS los items van a exento.
 * - IVA = 19% del `montoNeto` (la tasa actual chilena).
 * - Descuentos/recargos globales aplican al `montoNeto` cuando hay neto;
 *   si es full-exento, aplican al `montoExento`.
 * - Todos los montos se redondean a entero (CLP no tiene decimales).
 */

import type { DteDescuentoGlobal, DteItem, DteTotales, DteType } from './types-dte.js';

const IVA_RATE = 0.19;
const FULLY_EXEMPT_TYPES = new Set<DteType>([34, 41]);

/** Subtotal de una línea (después de descuento por línea). */
export const calculateItemSubtotal = (item: DteItem): number => {
  const gross = item.cantidad * item.precioUnitario;
  if (item.descuentoPct) {
    return Math.round(gross * (1 - item.descuentoPct / 100));
  }
  return Math.round(gross);
};

const applyGlobalDescuentosRecargos = (
  baseNeto: number,
  baseExento: number,
  descuentosGlobales: DteDescuentoGlobal[] | undefined,
): { neto: number; exento: number } => {
  if (!descuentosGlobales || descuentosGlobales.length === 0) {
    return { neto: baseNeto, exento: baseExento };
  }

  let neto = baseNeto;
  let exento = baseExento;
  for (const dr of descuentosGlobales) {
    const targetIsNeto = neto > 0;
    const baseAmount = targetIsNeto ? neto : exento;
    const amount =
      dr.expresion === '%' ? Math.round((baseAmount * dr.valor) / 100) : Math.round(dr.valor);
    const signed = dr.tipo === 'D' ? -amount : amount;
    if (targetIsNeto) neto = Math.max(0, neto + signed);
    else exento = Math.max(0, exento + signed);
  }
  return { neto, exento };
};

export const calculateTotales = (
  tipoDTE: DteType,
  items: DteItem[],
  descuentosGlobales?: DteDescuentoGlobal[],
): DteTotales => {
  const isFullyExempt = FULLY_EXEMPT_TYPES.has(tipoDTE);

  let baseNeto = 0;
  let baseExento = 0;
  for (const item of items) {
    const subtotal = calculateItemSubtotal(item);
    if (isFullyExempt || item.exento) baseExento += subtotal;
    else baseNeto += subtotal;
  }

  const { neto: montoNeto, exento: montoExento } = applyGlobalDescuentosRecargos(
    baseNeto,
    baseExento,
    descuentosGlobales,
  );

  const iva = isFullyExempt ? 0 : Math.round(montoNeto * IVA_RATE);
  const montoTotal = montoNeto + iva + montoExento;

  return { montoNeto, montoExento, iva, montoTotal };
};
