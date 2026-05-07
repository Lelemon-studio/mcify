import { describe, it, expect } from 'vitest';
import { calculateItemSubtotal, calculateTotales } from './totales.js';

describe('calculateItemSubtotal', () => {
  it('multiplies cantidad x precioUnitario when no descuento', () => {
    expect(calculateItemSubtotal({ nombre: 'X', cantidad: 3, precioUnitario: 1000 })).toBe(3000);
  });

  it('applies descuentoPct over the gross', () => {
    expect(
      calculateItemSubtotal({ nombre: 'X', cantidad: 2, precioUnitario: 1000, descuentoPct: 10 }),
    ).toBe(1800);
  });

  it('rounds to integer (CLP has no decimals)', () => {
    expect(
      calculateItemSubtotal({ nombre: 'X', cantidad: 1, precioUnitario: 999, descuentoPct: 7 }),
    ).toBe(929);
  });
});

describe('calculateTotales', () => {
  it('factura afecta (33): IVA 19% sobre el neto', () => {
    const totales = calculateTotales(33, [
      { nombre: 'A', cantidad: 1, precioUnitario: 10000 },
      { nombre: 'B', cantidad: 2, precioUnitario: 5000 },
    ]);
    expect(totales).toEqual({
      montoNeto: 20000,
      montoExento: 0,
      iva: 3800,
      montoTotal: 23800,
    });
  });

  it('boleta afecta (39): IVA va incluido en el total', () => {
    const totales = calculateTotales(39, [{ nombre: 'A', cantidad: 1, precioUnitario: 10000 }]);
    expect(totales.iva).toBe(1900);
    expect(totales.montoTotal).toBe(11900);
  });

  it('factura exenta (34): todo va a exento, IVA 0', () => {
    const totales = calculateTotales(34, [
      { nombre: 'Servicio', cantidad: 1, precioUnitario: 100000 },
    ]);
    expect(totales).toEqual({
      montoNeto: 0,
      montoExento: 100000,
      iva: 0,
      montoTotal: 100000,
    });
  });

  it('boleta exenta (41): igual lógica que 34', () => {
    const totales = calculateTotales(41, [{ nombre: 'X', cantidad: 1, precioUnitario: 5000 }]);
    expect(totales.iva).toBe(0);
    expect(totales.montoExento).toBe(5000);
    expect(totales.montoNeto).toBe(0);
  });

  it('mixto: items exentos en factura afecta van a montoExento', () => {
    const totales = calculateTotales(33, [
      { nombre: 'Afecto', cantidad: 1, precioUnitario: 10000 },
      { nombre: 'Exento', cantidad: 1, precioUnitario: 5000, exento: true },
    ]);
    expect(totales.montoNeto).toBe(10000);
    expect(totales.montoExento).toBe(5000);
    expect(totales.iva).toBe(1900);
    expect(totales.montoTotal).toBe(16900);
  });

  it('descuento global porcentual aplica al neto', () => {
    const totales = calculateTotales(
      33,
      [{ nombre: 'A', cantidad: 1, precioUnitario: 10000 }],
      [{ tipo: 'D', expresion: '%', valor: 10 }],
    );
    expect(totales.montoNeto).toBe(9000);
    expect(totales.iva).toBe(1710);
    expect(totales.montoTotal).toBe(10710);
  });

  it('recargo global absoluto aplica al neto', () => {
    const totales = calculateTotales(
      33,
      [{ nombre: 'A', cantidad: 1, precioUnitario: 10000 }],
      [{ tipo: 'R', expresion: '$', valor: 1000 }],
    );
    expect(totales.montoNeto).toBe(11000);
    expect(totales.iva).toBe(2090);
    expect(totales.montoTotal).toBe(13090);
  });

  it('descuento global no genera neto negativo', () => {
    const totales = calculateTotales(
      33,
      [{ nombre: 'A', cantidad: 1, precioUnitario: 1000 }],
      [{ tipo: 'D', expresion: '$', valor: 5000 }],
    );
    expect(totales.montoNeto).toBeGreaterThanOrEqual(0);
  });

  it('descuento por línea + descuento global se acumulan', () => {
    const totales = calculateTotales(
      33,
      [{ nombre: 'A', cantidad: 1, precioUnitario: 10000, descuentoPct: 10 }],
      [{ tipo: 'D', expresion: '%', valor: 10 }],
    );
    // Línea: 9000. Descuento global 10% sobre 9000 = 900. Neto = 8100.
    expect(totales.montoNeto).toBe(8100);
    expect(totales.iva).toBe(1539);
    expect(totales.montoTotal).toBe(9639);
  });
});
