import { describe, it, expect, vi } from 'vitest';
import { MercadoPagoApiError, MercadoPagoClient, mapMercadoPagoStatus } from './client.js';

const ok = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const err = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('MercadoPagoClient', () => {
  it('throws when constructed without an access token', () => {
    // @ts-expect-error invalid construction
    expect(() => new MercadoPagoClient({})).toThrow(/accessToken/);
  });

  describe('createPreference', () => {
    it('POSTs /checkout/preferences/ with Bearer auth and the items array', async () => {
      const fetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve(
          ok({
            id: 'pref_1234',
            init_point: 'https://www.mercadopago.cl/checkout/v1/redirect?pref_id=pref_1234',
            sandbox_init_point: 'https://sandbox.mp.cl/redirect?pref_id=pref_1234',
            external_reference: 'order-1234',
          }),
        ),
      );

      const client = new MercadoPagoClient({ accessToken: 'TEST-1234', fetch: fetchMock });
      const result = await client.createPreference({
        subject: 'Pedido #1234',
        amount: 50000,
        currency: 'CLP',
        externalId: 'order-1234',
        successUrl: 'https://merchant.cl/success',
        cancelUrl: 'https://merchant.cl/cancel',
        notifyUrl: 'https://merchant.cl/notify',
        customer: { name: 'Acme SpA', email: 'pago@acme.cl', rut: '11.111.111-1' },
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe('https://api.mercadopago.com/checkout/preferences/');
      const reqInit = init as RequestInit;
      expect(reqInit.method).toBe('POST');
      const headers = reqInit.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer TEST-1234');
      expect(headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(reqInit.body as string);
      expect(body.items).toHaveLength(1);
      expect(body.items[0]).toMatchObject({
        title: 'Pedido #1234',
        quantity: 1,
        unit_price: 50000,
        currency_id: 'CLP',
      });
      expect(body.external_reference).toBe('order-1234');
      expect(body.notification_url).toBe('https://merchant.cl/notify');
      expect(body.back_urls).toEqual({
        success: 'https://merchant.cl/success',
        failure: 'https://merchant.cl/cancel',
      });
      expect(body.payer).toMatchObject({
        name: 'Acme SpA',
        email: 'pago@acme.cl',
        identification: { type: 'RUT', number: '11.111.111-1' },
      });

      expect(result).toMatchObject({
        paymentId: 'pref_1234',
        paymentUrl: 'https://www.mercadopago.cl/checkout/v1/redirect?pref_id=pref_1234',
        status: 'pending',
        amount: 50000,
        currency: 'CLP',
        externalId: 'order-1234',
      });
      expect(result.vendor?.mercadopago?.sandboxInitPoint).toBe(
        'https://sandbox.mp.cl/redirect?pref_id=pref_1234',
      );
    });

    it('returns sandbox_init_point as primary URL when preferSandbox is set', async () => {
      const fetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve(
          ok({
            id: 'pref_1',
            init_point: 'https://prod.mp/p',
            sandbox_init_point: 'https://sandbox.mp/p',
          }),
        ),
      );
      const client = new MercadoPagoClient({
        accessToken: 'TEST-1',
        fetch: fetchMock,
        preferSandboxInitPoint: true,
      });
      const result = await client.createPreference({
        subject: 'X',
        amount: 1000,
        currency: 'CLP',
      });
      expect(result.paymentUrl).toBe('https://sandbox.mp/p');
    });

    it('forwards vendor.mercadopago advanced fields (per-line items, excluded methods, installments)', async () => {
      const fetchMock = vi
        .fn()
        .mockImplementation(() => Promise.resolve(ok({ id: 'pref_1', init_point: 'https://x' })));
      const client = new MercadoPagoClient({ accessToken: 'TEST-1', fetch: fetchMock });
      await client.createPreference({
        subject: 'fallback',
        amount: 50000,
        currency: 'CLP',
        vendor: {
          mercadopago: {
            items: [
              { title: 'Producto A', quantity: 2, unitPrice: 10000 },
              { title: 'Producto B', quantity: 1, unitPrice: 30000 },
            ],
            excludedPaymentTypes: ['ticket'],
            installments: 3,
            statementDescriptor: 'LELEMON STUDIO',
            autoReturn: 'approved',
          },
        },
      });
      const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
      expect(body.items).toHaveLength(2);
      expect(body.items[0]).toMatchObject({ title: 'Producto A', quantity: 2, unit_price: 10000 });
      expect(body.payment_methods).toEqual({
        excluded_payment_types: [{ id: 'ticket' }],
        installments: 3,
      });
      expect(body.statement_descriptor).toBe('LELEMON STUDIO');
      expect(body.auto_return).toBe('approved');
    });

    it('serialises expiresAt with `expires=true` + date_of_expiration', async () => {
      const fetchMock = vi
        .fn()
        .mockImplementation(() => Promise.resolve(ok({ id: 'pref_1', init_point: 'https://x' })));
      const client = new MercadoPagoClient({ accessToken: 'TEST-1', fetch: fetchMock });
      await client.createPreference({
        subject: 'X',
        amount: 1000,
        currency: 'CLP',
        expiresAt: '2026-05-15T00:00:00Z',
      });
      const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
      expect(body.expires).toBe(true);
      expect(body.date_of_expiration).toBe('2026-05-15T00:00:00Z');
    });
  });

  describe('getPreference', () => {
    it('GETs the preference and merges the latest payment status', async () => {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url.endsWith('/checkout/preferences/pref_1')) {
          return Promise.resolve(
            ok({
              id: 'pref_1',
              init_point: 'https://x',
              external_reference: 'order-1234',
              items: [{ title: 'X', unit_price: 50000, currency_id: 'CLP' }],
            }),
          );
        }
        if (url.includes('/v1/payments/search')) {
          return Promise.resolve(
            ok({
              results: [
                {
                  id: 9999,
                  status: 'approved',
                  status_detail: 'accredited',
                  date_approved: '2026-05-08T15:00:00Z',
                  preference_id: 'pref_1',
                  receipt_url: 'https://mp.cl/r/9999',
                },
              ],
            }),
          );
        }
        throw new Error('unexpected URL ' + url);
      });

      const client = new MercadoPagoClient({ accessToken: 'TEST-1', fetch: fetchMock });
      const result = await client.getPreference('pref_1');

      expect(result.paymentId).toBe('pref_1');
      expect(result.status).toBe('paid');
      expect(result.paidAt).toBe('2026-05-08T15:00:00Z');
      expect(result.receiptUrl).toBe('https://mp.cl/r/9999');
      expect(result.vendor?.mercadopago?.paymentId).toBe('9999');
      expect(result.vendor?.mercadopago?.paymentStatus).toBe('approved');
      expect(result.vendor?.mercadopago?.paymentStatusDetail).toBe('accredited');
    });

    it('returns status `pending` when no payment is found yet', async () => {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url.endsWith('/checkout/preferences/pref_1')) {
          return Promise.resolve(ok({ id: 'pref_1', init_point: 'https://x' }));
        }
        return Promise.resolve(ok({ results: [] }));
      });
      const client = new MercadoPagoClient({ accessToken: 'TEST-1', fetch: fetchMock });
      const result = await client.getPreference('pref_1');
      expect(result.status).toBe('pending');
      expect(result.vendor?.mercadopago?.paymentId).toBeUndefined();
    });
  });

  describe('refundPayment', () => {
    it('resolves a numeric id as a payment id and POSTs the refund directly', async () => {
      const fetchMock = vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(ok({ id: 1, payment_id: 9999, amount: 25000, status: 'approved' })),
        );
      const client = new MercadoPagoClient({ accessToken: 'TEST-1', fetch: fetchMock });
      const result = await client.refundPayment('9999', 25000);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe('https://api.mercadopago.com/v1/payments/9999/refunds');
      expect((init as RequestInit).method).toBe('POST');
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body).toEqual({ amount: 25000 });

      expect(result).toMatchObject({
        paymentId: '9999',
        refunded: true,
        refundId: '1',
      });
    });

    it('resolves an alphanumeric id as a preference and looks up the payment first', async () => {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/v1/payments/search')) {
          return Promise.resolve(
            ok({ results: [{ id: 9999, status: 'approved', preference_id: 'pref_abc' }] }),
          );
        }
        if (url.endsWith('/v1/payments/9999/refunds')) {
          return Promise.resolve(ok({ id: 1, status: 'approved' }));
        }
        throw new Error('unexpected URL ' + url);
      });
      const client = new MercadoPagoClient({ accessToken: 'TEST-1', fetch: fetchMock });
      const result = await client.refundPayment('pref_abc');
      expect(result.refunded).toBe(true);
    });

    it('returns refunded=false when the preference has no payment yet', async () => {
      const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(ok({ results: [] })));
      const client = new MercadoPagoClient({ accessToken: 'TEST-1', fetch: fetchMock });
      const result = await client.refundPayment('pref_no_payment');
      expect(result.refunded).toBe(false);
      expect(result.message).toMatch(/No payment/);
    });
  });

  describe('listPaymentMethods', () => {
    it('GETs /v1/payment_methods and maps to PaymentMethodItem', async () => {
      const fetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve(
          ok([
            {
              id: 'visa',
              name: 'Visa',
              payment_type_id: 'credit_card',
              status: 'active',
              thumbnail: 'https://mp.cl/visa.png',
            },
          ]),
        ),
      );
      const client = new MercadoPagoClient({ accessToken: 'TEST-1', fetch: fetchMock });
      const methods = await client.listPaymentMethods();
      expect(methods).toEqual([
        {
          id: 'visa',
          name: 'Visa',
          paymentTypeId: 'credit_card',
          status: 'active',
          thumbnail: 'https://mp.cl/visa.png',
        },
      ]);
    });
  });

  describe('error handling', () => {
    it('wraps non-2xx in MercadoPagoApiError with message extracted from cause[]', async () => {
      const fetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve(
          err(400, {
            error: 'bad_request',
            message: 'invalid items',
            cause: [{ code: '4001', description: 'amount must be positive' }],
          }),
        ),
      );
      const client = new MercadoPagoClient({ accessToken: 'TEST-1', fetch: fetchMock });
      try {
        await client.createPreference({ subject: 'X', amount: 0, currency: 'CLP' });
        expect.fail('expected to throw');
      } catch (e) {
        expect(e).toBeInstanceOf(MercadoPagoApiError);
        const apiError = e as MercadoPagoApiError;
        expect(apiError.status).toBe(400);
        expect(apiError.message).toBe('invalid items');
      }
    });
  });
});

describe('mapMercadoPagoStatus', () => {
  it('approved + authorized → paid', () => {
    expect(mapMercadoPagoStatus('approved')).toBe('paid');
    expect(mapMercadoPagoStatus('authorized')).toBe('paid');
  });

  it('pending / in_process / in_mediation → pending', () => {
    expect(mapMercadoPagoStatus('pending')).toBe('pending');
    expect(mapMercadoPagoStatus('in_process')).toBe('pending');
    expect(mapMercadoPagoStatus('in_mediation')).toBe('pending');
  });

  it('rejected → failed', () => {
    expect(mapMercadoPagoStatus('rejected')).toBe('failed');
  });

  it('cancelled → cancelled', () => {
    expect(mapMercadoPagoStatus('cancelled')).toBe('cancelled');
  });

  it('refunded + charged_back → refunded', () => {
    expect(mapMercadoPagoStatus('refunded')).toBe('refunded');
    expect(mapMercadoPagoStatus('charged_back')).toBe('refunded');
  });

  it('undefined → pending', () => {
    expect(mapMercadoPagoStatus(undefined)).toBe('pending');
  });
});
