import { describe, it, expect, vi } from 'vitest';
import { KhipuClient } from './client.js';

const okResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const errorResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('KhipuClient', () => {
  it('throws when constructed without an API key', () => {
    // @ts-expect-error invalid construction
    expect(() => new KhipuClient({})).toThrow(/apiKey/);
  });

  describe('createPayment', () => {
    it('POSTs to /payments with the API key header and snake_cases the body', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        okResponse({
          payment_id: 'p_123',
          payment_url: 'https://khipu.com/payment/info/abc',
          ready_for_terminal: false,
          expires_date: '2026-05-12T00:00:00Z',
        }),
      );

      const client = new KhipuClient({
        apiKey: 'k_test',
        baseUrl: 'https://payment-api.khipu.com/v3',
        fetch: fetchMock,
      });

      const result = await client.createPayment({
        subject: 'Order #1',
        currency: 'CLP',
        amount: 50000,
        transactionId: 'order-1',
        returnUrl: 'https://example.com/ok',
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe('https://payment-api.khipu.com/v3/payments');
      const reqInit = init as RequestInit;
      expect(reqInit.method).toBe('POST');
      const headers = reqInit.headers as Record<string, string>;
      expect(headers['x-api-key']).toBe('k_test');
      expect(headers['content-type']).toBe('application/json');
      expect(JSON.parse(reqInit.body as string)).toEqual({
        subject: 'Order #1',
        currency: 'CLP',
        amount: 50000,
        transaction_id: 'order-1',
        return_url: 'https://example.com/ok',
      });

      expect(result).toEqual({
        paymentId: 'p_123',
        paymentUrl: 'https://khipu.com/payment/info/abc',
        readyForTerminal: false,
        expiresDate: '2026-05-12T00:00:00Z',
      });
    });

    it('throws KhipuApiError with the upstream message when Khipu rejects', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(errorResponse(401, { message: 'Invalid API key', status: 401 }));
      const client = new KhipuClient({ apiKey: 'wrong', fetch: fetchMock });

      await expect(
        client.createPayment({ subject: 's', currency: 'CLP', amount: 100 }),
      ).rejects.toMatchObject({
        name: 'KhipuApiError',
        status: 401,
        message: 'Invalid API key',
      });
    });

    it('falls back to a generic message when the error body has no `message`', async () => {
      const fetchMock = vi.fn().mockResolvedValue(errorResponse(500, {}));
      const client = new KhipuClient({ apiKey: 'k', fetch: fetchMock });

      await expect(
        client.createPayment({ subject: 's', currency: 'CLP', amount: 100 }),
      ).rejects.toThrow(/Khipu request failed: 500/);
    });
  });

  describe('getPayment', () => {
    it('GETs /payments/:id and maps snake_case → camelCase', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        okResponse({
          payment_id: 'p_abc',
          status: 'done',
          status_detail: 'normal',
          subject: 'Order #1',
          currency: 'CLP',
          amount: 50000,
          transaction_id: 'order-1',
        }),
      );
      const client = new KhipuClient({ apiKey: 'k', fetch: fetchMock });

      const result = await client.getPayment('p_abc');
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe('https://payment-api.khipu.com/v3/payments/p_abc');
      expect((init as RequestInit).method).toBe('GET');
      expect(result).toEqual({
        paymentId: 'p_abc',
        status: 'done',
        statusDetail: 'normal',
        subject: 'Order #1',
        currency: 'CLP',
        amount: 50000,
        transactionId: 'order-1',
      });
    });

    it('URI-encodes the payment id', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        okResponse({
          payment_id: 'weird/id',
          status: 'pending',
          subject: 's',
          currency: 'CLP',
          amount: 1,
        }),
      );
      const client = new KhipuClient({ apiKey: 'k', fetch: fetchMock });
      await client.getPayment('weird/id');
      const [url] = fetchMock.mock.calls[0]!;
      expect(url).toContain('/payments/weird%2Fid');
    });
  });
});
