import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  paymentLinkInputBaseSchema,
  paymentLinkResultBaseSchema,
  paymentLinkStatusSchema,
  paymentCustomerSchema,
  refundInputSchema,
  refundResultSchema,
} from './types.js';

describe('paymentLinkStatusSchema', () => {
  it('accepts the six canonical states', () => {
    for (const s of ['pending', 'paid', 'expired', 'cancelled', 'failed', 'refunded'] as const) {
      expect(paymentLinkStatusSchema.parse(s)).toBe(s);
    }
  });

  it('rejects vendor-native states (we collapse those at the connector layer)', () => {
    expect(() => paymentLinkStatusSchema.parse('approved')).toThrow();
    expect(() => paymentLinkStatusSchema.parse('verifying')).toThrow();
    expect(() => paymentLinkStatusSchema.parse('rejected')).toThrow();
  });
});

describe('paymentLinkInputBaseSchema', () => {
  it('accepts a minimal valid input', () => {
    const parsed = paymentLinkInputBaseSchema.parse({
      subject: 'Pedido #1234',
      amount: 50000,
      currency: 'CLP',
    });
    expect(parsed).toMatchObject({
      subject: 'Pedido #1234',
      amount: 50000,
      currency: 'CLP',
    });
  });

  it('rejects negative amounts', () => {
    expect(() =>
      paymentLinkInputBaseSchema.parse({ subject: 'X', amount: -1, currency: 'CLP' }),
    ).toThrow();
  });

  it('rejects unsupported currency codes', () => {
    expect(() =>
      paymentLinkInputBaseSchema.parse({ subject: 'X', amount: 1, currency: 'EUR' }),
    ).toThrow();
  });

  it('accepts optional customer + ISO expiresAt', () => {
    const parsed = paymentLinkInputBaseSchema.parse({
      subject: 'X',
      amount: 1000,
      currency: 'CLP',
      customer: { name: 'Acme', email: 'a@b.cl', rut: '11.111.111-1' },
      expiresAt: '2026-05-15T00:00:00Z',
    });
    expect(parsed.customer?.email).toBe('a@b.cl');
    expect(parsed.expiresAt).toBe('2026-05-15T00:00:00Z');
  });
});

describe('paymentLinkResultBaseSchema', () => {
  it('parses a portable result with all canonical fields', () => {
    const parsed = paymentLinkResultBaseSchema.parse({
      paymentId: 'pay_123',
      paymentUrl: 'https://vendor.cl/pay/123',
      status: 'paid',
      amount: 50000,
      currency: 'CLP',
      subject: 'Pedido #1234',
      paidAt: '2026-05-08T10:00:00Z',
      receiptUrl: 'https://vendor.cl/r/123',
    });
    expect(parsed.status).toBe('paid');
  });
});

describe('refund schemas', () => {
  it('refundInputSchema accepts amount and a paymentId', () => {
    expect(refundInputSchema.parse({ paymentId: 'p1', amount: 1000 })).toMatchObject({
      paymentId: 'p1',
      amount: 1000,
    });
  });

  it('refundInputSchema requires a positive amount when provided', () => {
    expect(() => refundInputSchema.parse({ paymentId: 'p1', amount: 0 })).toThrow();
    expect(() => refundInputSchema.parse({ paymentId: 'p1', amount: -1 })).toThrow();
  });

  it('refundResultSchema accepts a minimal result', () => {
    const parsed = refundResultSchema.parse({ paymentId: 'p1', refunded: true });
    expect(parsed.refunded).toBe(true);
  });
});

describe('paymentCustomerSchema', () => {
  it('rejects invalid email but accepts only-name', () => {
    expect(() => paymentCustomerSchema.parse({ email: 'not-an-email' })).toThrow();
    expect(paymentCustomerSchema.parse({ name: 'Acme' })).toEqual({ name: 'Acme' });
  });
});

describe('extending the base schema with a vendor namespace', () => {
  it('connectors extend with .extend({ vendor: ... }) and infer the full path', () => {
    const extended = paymentLinkInputBaseSchema.extend({
      vendor: z
        .object({
          khipu: z
            .object({
              bankId: z.string().optional(),
            })
            .optional(),
        })
        .optional(),
    });

    const parsed = extended.parse({
      subject: 'X',
      amount: 1000,
      currency: 'CLP',
      vendor: { khipu: { bankId: 'cl_banco_estado' } },
    });
    expect(parsed.vendor?.khipu?.bankId).toBe('cl_banco_estado');

    // Without vendor still works.
    const parsed2 = extended.parse({ subject: 'X', amount: 1000, currency: 'CLP' });
    expect(parsed2.vendor).toBeUndefined();
  });
});
