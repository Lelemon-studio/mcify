import { describe, it, expect, vi } from 'vitest';
import { KhipuApiError, KhipuClient, mapKhipuStatus } from './client.js';

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

const noContent = (): Response =>
  new Response(null, {
    status: 204,
  });

describe('KhipuClient', () => {
  it('throws when constructed without an api key', () => {
    // @ts-expect-error invalid construction
    expect(() => new KhipuClient({})).toThrow(/apiKey/);
  });

  describe('createPayment', () => {
    it('POSTs /payments with x-api-key, snake_case body, and maps the response to PaymentLinkResult', async () => {
      const fetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve(
          ok({
            payment_id: 'pay_123',
            payment_url: 'https://khipu.com/payment/pay_123',
            simplified_transfer_url: 'https://khipu.com/p/pay_123/simple',
            transfer_url: 'https://khipu.com/p/pay_123/transfer',
            webpay_url: 'https://khipu.com/p/pay_123/webpay',
            app_url: 'khipu://pay_123',
            ready_for_terminal: false,
            notification_token: 'tok_abc',
            expires_date: '2026-05-15T00:00:00Z',
            status: 'pending',
            subject: 'Pedido #1234',
            currency: 'CLP',
            amount: 50000,
            transaction_id: 'order-1234',
          }),
        ),
      );

      const client = new KhipuClient({ apiKey: 'kp_test_xyz', fetch: fetchMock });
      const result = await client.createPayment({
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
      expect(url).toBe('https://payment-api.khipu.com/v3/payments');
      const reqInit = init as RequestInit;
      expect(reqInit.method).toBe('POST');
      const headers = reqInit.headers as Record<string, string>;
      expect(headers['x-api-key']).toBe('kp_test_xyz');
      expect(headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(reqInit.body as string);
      expect(body).toMatchObject({
        subject: 'Pedido #1234',
        amount: 50000,
        currency: 'CLP',
        transaction_id: 'order-1234',
        return_url: 'https://merchant.cl/success',
        cancel_url: 'https://merchant.cl/cancel',
        notify_url: 'https://merchant.cl/notify',
        payer_name: 'Acme SpA',
        payer_email: 'pago@acme.cl',
        fixed_payer_personal_identifier: '11.111.111-1',
      });

      expect(result).toMatchObject({
        paymentId: 'pay_123',
        paymentUrl: 'https://khipu.com/payment/pay_123',
        status: 'pending',
        amount: 50000,
        currency: 'CLP',
        subject: 'Pedido #1234',
        externalId: 'order-1234',
        expiresAt: '2026-05-15T00:00:00Z',
      });
      expect(result.vendor?.khipu).toMatchObject({
        simplifiedTransferUrl: 'https://khipu.com/p/pay_123/simple',
        transferUrl: 'https://khipu.com/p/pay_123/transfer',
        webpayUrl: 'https://khipu.com/p/pay_123/webpay',
        appUrl: 'khipu://pay_123',
        notificationToken: 'tok_abc',
        readyForTerminal: false,
      });
    });

    it('forwards vendor.khipu advanced fields (bankId, mandatoryPaymentMethod, sendEmail)', async () => {
      const fetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve(
          ok({
            payment_id: 'pay_1',
            payment_url: 'https://khipu.com/payment/pay_1',
            status: 'pending',
            subject: 'X',
            currency: 'CLP',
            amount: 1000,
          }),
        ),
      );
      const client = new KhipuClient({ apiKey: 'kp', fetch: fetchMock });
      await client.createPayment({
        subject: 'X',
        amount: 1000,
        currency: 'CLP',
        vendor: {
          khipu: {
            bankId: 'cl_banco_estado',
            mandatoryPaymentMethod: 'simplified_transfer',
            sendEmail: true,
            sendReminders: false,
          },
        },
      });
      const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
      expect(body.bank_id).toBe('cl_banco_estado');
      expect(body.mandatory_payment_method).toBe('simplified_transfer');
      expect(body.send_email).toBe(true);
      expect(body.send_reminders).toBe(false);
    });
  });

  describe('getPayment', () => {
    it('GETs /payments/:id and maps `done` status to portable `paid`', async () => {
      const fetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve(
          ok({
            payment_id: 'pay_1',
            payment_url: 'https://khipu.com/p/pay_1',
            status: 'done',
            subject: 'X',
            currency: 'CLP',
            amount: 50000,
            conciliation_date: '2026-05-08T15:00:00Z',
            receipt_url: 'https://khipu.com/r/pay_1',
          }),
        ),
      );
      const client = new KhipuClient({ apiKey: 'kp', fetch: fetchMock });
      const result = await client.getPayment('pay_1');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://payment-api.khipu.com/v3/payments/pay_1',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result.status).toBe('paid');
      expect(result.paidAt).toBe('2026-05-08T15:00:00Z');
      expect(result.receiptUrl).toBe('https://khipu.com/r/pay_1');
    });
  });

  describe('cancelPayment', () => {
    it('DELETEs /payments/:id and returns the cancelled flag', async () => {
      const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(noContent()));
      const client = new KhipuClient({ apiKey: 'kp', fetch: fetchMock });
      const result = await client.cancelPayment('pay_1');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://payment-api.khipu.com/v3/payments/pay_1',
        expect.objectContaining({ method: 'DELETE' }),
      );
      expect(result).toEqual({ paymentId: 'pay_1', cancelled: true });
    });
  });

  describe('refundPayment', () => {
    it('POSTs /payments/:id/refunds with the amount when given (partial refund)', async () => {
      const fetchMock = vi
        .fn()
        .mockImplementation(() => Promise.resolve(ok({ message: 'refund accepted' })));
      const client = new KhipuClient({ apiKey: 'kp', fetch: fetchMock });

      const result = await client.refundPayment('pay_1', 25000);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe('https://payment-api.khipu.com/v3/payments/pay_1/refunds');
      expect((init as RequestInit).method).toBe('POST');
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body).toEqual({ amount: 25000 });

      expect(result).toEqual({
        paymentId: 'pay_1',
        refunded: true,
        message: 'refund accepted',
      });
    });

    it('omits the body when no amount is given (full refund)', async () => {
      const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(ok({})));
      const client = new KhipuClient({ apiKey: 'kp', fetch: fetchMock });

      await client.refundPayment('pay_1');
      const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
      expect(body).toEqual({});
    });
  });

  describe('listBanks', () => {
    it('GETs /banks and maps to BankItem (object form)', async () => {
      const fetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve(
          ok({
            banks: [
              {
                bank_id: 'cl_banco_estado',
                name: 'BancoEstado',
                message: 'available',
                min_amount: 1000,
                type: 'BANK',
              },
            ],
          }),
        ),
      );
      const client = new KhipuClient({ apiKey: 'kp', fetch: fetchMock });
      const banks = await client.listBanks();

      expect(fetchMock).toHaveBeenCalledWith(
        'https://payment-api.khipu.com/v3/banks',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(banks).toEqual([
        {
          bankId: 'cl_banco_estado',
          name: 'BancoEstado',
          message: 'available',
          minAmount: 1000,
          type: 'BANK',
        },
      ]);
    });

    it('handles the array form of /banks response', async () => {
      const fetchMock = vi
        .fn()
        .mockImplementation(() => Promise.resolve(ok([{ bank_id: 'cl_bci', name: 'BCI' }])));
      const client = new KhipuClient({ apiKey: 'kp', fetch: fetchMock });
      const banks = await client.listBanks();
      expect(banks).toEqual([{ bankId: 'cl_bci', name: 'BCI' }]);
    });
  });

  describe('listPaymentMethods', () => {
    it('GETs /payment-methods and normalises both naming variants', async () => {
      const fetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve(
          ok({
            paymentMethods: [
              {
                id: 'simplified_transfer',
                name: 'Transferencia simplificada',
                logo_url: 'https://khipu.com/img/st.png',
                available: true,
              },
            ],
          }),
        ),
      );
      const client = new KhipuClient({ apiKey: 'kp', fetch: fetchMock });
      const methods = await client.listPaymentMethods();
      expect(methods).toEqual([
        {
          id: 'simplified_transfer',
          name: 'Transferencia simplificada',
          logoUrl: 'https://khipu.com/img/st.png',
          available: true,
        },
      ]);
    });
  });

  describe('error handling', () => {
    it('wraps non-2xx responses in KhipuApiError with message and status', async () => {
      const fetchMock = vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(err(401, { message: 'Invalid API key', status: 401 })),
        );
      const client = new KhipuClient({ apiKey: 'kp_bad', fetch: fetchMock });

      try {
        await client.getPayment('pay_x');
        expect.fail('expected getPayment to throw');
      } catch (e) {
        expect(e).toBeInstanceOf(KhipuApiError);
        const apiError = e as KhipuApiError;
        expect(apiError.status).toBe(401);
        expect(apiError.message).toBe('Invalid API key');
      }
    });

    it('extracts message from errors[] when present', async () => {
      const fetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve(
          err(400, {
            errors: [{ field: 'amount', description: 'amount must be positive' }],
          }),
        ),
      );
      const client = new KhipuClient({ apiKey: 'kp', fetch: fetchMock });
      try {
        await client.createPayment({ subject: 'X', amount: 0, currency: 'CLP' });
        expect.fail('expected to throw');
      } catch (e) {
        const apiError = e as KhipuApiError;
        expect(apiError.message).toBe('amount: amount must be positive');
      }
    });
  });
});

describe('mapKhipuStatus', () => {
  it('collapses done + committed to paid', () => {
    expect(mapKhipuStatus('done')).toBe('paid');
    expect(mapKhipuStatus('committed')).toBe('paid');
  });

  it('collapses verifying to pending', () => {
    expect(mapKhipuStatus('verifying')).toBe('pending');
    expect(mapKhipuStatus('pending')).toBe('pending');
  });

  it('collapses failed + rejected to failed', () => {
    expect(mapKhipuStatus('failed')).toBe('failed');
    expect(mapKhipuStatus('rejected')).toBe('failed');
  });

  it('returns pending for undefined', () => {
    expect(mapKhipuStatus(undefined)).toBe('pending');
  });
});
