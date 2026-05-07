import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_FINTOC_VERSION, FintocApiError, FintocClient } from './client.js';

const ok = (body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers },
  });

const err = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const sampleAccount = {
  id: 'acc_1',
  name: 'Cuenta Corriente',
  official_name: 'Cuenta Corriente Pesos',
  number: '12345678',
  holder_id: '11.111.111-1',
  holder_name: 'Acme SpA',
  type: 'checking_account' as const,
  currency: 'CLP',
  balance: { available: 100000, current: 105000 },
};

const sampleMovementOutbound = {
  id: 'mov_1',
  amount: -25000,
  currency: 'CLP',
  post_date: '2024-05-08',
  transaction_date: '2024-05-07T19:16:00.000Z',
  description: 'Transferencia a proveedor',
  recipient_account: { holder_id: '22.222.222-2', holder_name: 'Proveedor' },
  type: 'transfer' as const,
  pending: false,
};

const sampleMovementInbound = {
  id: 'mov_2',
  amount: 80000,
  currency: 'CLP',
  post_date: '2024-05-09',
  transaction_date: '2024-05-09T10:30:00.000Z',
  description: 'Pago recibido',
  sender_account: { holder_id: '33.333.333-3', holder_name: 'Cliente Pagador' },
  type: 'transfer' as const,
};

describe('FintocClient', () => {
  it('throws when constructed without a secret key', () => {
    // @ts-expect-error invalid construction
    expect(() => new FintocClient({})).toThrow(/secretKey/);
  });

  describe('listAccounts', () => {
    it('GETs /accounts with link_token, Authorization (no Bearer), and Fintoc-Version header', async () => {
      const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(ok([sampleAccount])));
      const client = new FintocClient({ secretKey: 'sk_test_123', fetch: fetchMock });

      const out = await client.listAccounts('link_abc');

      const [url, init] = fetchMock.mock.calls[0]!;
      const parsed = new URL(url as string);
      expect(parsed.pathname).toBe('/v1/accounts');
      expect(parsed.searchParams.get('link_token')).toBe('link_abc');
      const headers = (init as RequestInit).headers as Record<string, string>;
      // Fintoc uses the secret key directly — literal, no `Bearer` prefix.
      expect(headers.Authorization).toBe('sk_test_123');
      expect(headers.Accept).toBe('application/json');
      expect(headers['Fintoc-Version']).toBe(DEFAULT_FINTOC_VERSION);

      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({
        id: 'acc_1',
        officialName: 'Cuenta Corriente Pesos',
        holderId: '11.111.111-1',
        balance: { available: 100000, current: 105000 },
      });
    });

    it('respects an explicit fintocVersion override', async () => {
      const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(ok([sampleAccount])));
      const client = new FintocClient({
        secretKey: 'sk_test_123',
        fintocVersion: '2023-11-15',
        fetch: fetchMock,
      });
      await client.listAccounts('link_abc');
      const headers = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<
        string,
        string
      >;
      expect(headers['Fintoc-Version']).toBe('2023-11-15');
    });
  });

  describe('getAccount', () => {
    it('GETs /accounts/:id with the link_token', async () => {
      const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(ok(sampleAccount)));
      const client = new FintocClient({ secretKey: 'sk_test_123', fetch: fetchMock });

      const out = await client.getAccount('link_abc', 'acc_1');

      const [url] = fetchMock.mock.calls[0]!;
      const parsed = new URL(url as string);
      expect(parsed.pathname).toBe('/v1/accounts/acc_1');
      expect(parsed.searchParams.get('link_token')).toBe('link_abc');

      expect(out.id).toBe('acc_1');
      expect(out.balance.available).toBe(100000);
    });

    it('encodes the account id', async () => {
      const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(ok(sampleAccount)));
      const client = new FintocClient({ secretKey: 'sk_test_123', fetch: fetchMock });

      await client.getAccount('link_abc', 'acc/with slash');

      const [url] = fetchMock.mock.calls[0]!;
      expect(String(url)).toContain('/accounts/acc%2Fwith%20slash');
    });
  });

  describe('listMovements', () => {
    it('forwards date range and per_page filters; maps both recipient and sender accounts', async () => {
      const fetchMock = vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(ok([sampleMovementOutbound, sampleMovementInbound])),
        );
      const client = new FintocClient({ secretKey: 'sk_test_123', fetch: fetchMock });

      const out = await client.listMovements('link_abc', 'acc_1', {
        since: '2024-05-01',
        until: '2024-05-31',
        perPage: 100,
      });

      const [url] = fetchMock.mock.calls[0]!;
      const parsed = new URL(url as string);
      expect(parsed.pathname).toBe('/v1/accounts/acc_1/movements');
      expect(parsed.searchParams.get('since')).toBe('2024-05-01');
      expect(parsed.searchParams.get('until')).toBe('2024-05-31');
      expect(parsed.searchParams.get('per_page')).toBe('100');

      expect(out).toHaveLength(2);
      expect(out[0]).toMatchObject({
        id: 'mov_1',
        amount: -25000,
        transactionDate: '2024-05-07T19:16:00.000Z',
        recipientAccount: { holderId: '22.222.222-2', holderName: 'Proveedor' },
      });
      expect(out[0]).not.toHaveProperty('senderAccount');
      expect(out[1]).toMatchObject({
        id: 'mov_2',
        amount: 80000,
        senderAccount: { holderId: '33.333.333-3', holderName: 'Cliente Pagador' },
      });
      expect(out[1]).not.toHaveProperty('recipientAccount');
    });

    it('omits filters when not provided', async () => {
      const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(ok([])));
      const client = new FintocClient({ secretKey: 'sk_test_123', fetch: fetchMock });

      await client.listMovements('link_abc', 'acc_1');

      const [url] = fetchMock.mock.calls[0]!;
      const parsed = new URL(url as string);
      expect(parsed.searchParams.has('since')).toBe(false);
      expect(parsed.searchParams.has('until')).toBe(false);
      expect(parsed.searchParams.has('per_page')).toBe(false);
      expect(parsed.searchParams.get('link_token')).toBe('link_abc');
    });

    it('follows the Link: rel="next" header to fetch all pages', async () => {
      let call = 0;
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        call++;
        if (call === 1) {
          // First page returns mov_1 + a Link header to page 2.
          expect(url).toContain('/v1/accounts/acc_1/movements');
          return Promise.resolve(
            ok([sampleMovementOutbound], {
              Link: '<https://api.fintoc.com/v1/accounts/acc_1/movements?page=2&link_token=link_abc>; rel="next"',
            }),
          );
        }
        if (call === 2) {
          // Second page returns mov_2 + a Link header for "prev" only (no next).
          expect(url).toContain('page=2');
          return Promise.resolve(
            ok([sampleMovementInbound], {
              Link: '<https://api.fintoc.com/v1/accounts/acc_1/movements?page=1&link_token=link_abc>; rel="prev"',
            }),
          );
        }
        throw new Error('Unexpected extra call');
      });

      const client = new FintocClient({ secretKey: 'sk_test_123', fetch: fetchMock });
      const out = await client.listMovements('link_abc', 'acc_1');

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(out).toHaveLength(2);
      expect(out.map((m) => m.id)).toEqual(['mov_1', 'mov_2']);
    });

    it('respects maxPages cap to avoid runaway pagination', async () => {
      const fetchMock = vi.fn().mockImplementation((url: string) =>
        Promise.resolve(
          ok([sampleMovementOutbound], {
            // Always advertises another page — would loop forever without the cap.
            Link: `<${url}&loop=1>; rel="next"`,
          }),
        ),
      );
      const client = new FintocClient({ secretKey: 'sk_test_123', fetch: fetchMock });

      const out = await client.listMovements('link_abc', 'acc_1', { maxPages: 3 });

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(out).toHaveLength(3);
    });
  });

  describe('createRefreshIntent', () => {
    it('POSTs /refresh_intents with the link_token and parses the response', async () => {
      const fetchMock = vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(
            ok({ id: 'ri_1', status: 'created', created_at: '2024-05-08T12:00:00Z' }),
          ),
        );
      const client = new FintocClient({ secretKey: 'sk_test_123', fetch: fetchMock });

      const out = await client.createRefreshIntent('link_abc');

      const [url, init] = fetchMock.mock.calls[0]!;
      const parsed = new URL(url as string);
      expect(parsed.pathname).toBe('/v1/refresh_intents');
      const reqInit = init as RequestInit;
      expect(reqInit.method).toBe('POST');
      const headers = reqInit.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Fintoc-Version']).toBe(DEFAULT_FINTOC_VERSION);
      expect(JSON.parse(reqInit.body as string)).toEqual({ link_token: 'link_abc' });

      expect(out).toEqual({
        id: 'ri_1',
        status: 'created',
        createdAt: '2024-05-08T12:00:00Z',
      });
    });
  });

  describe('error handling', () => {
    it('wraps non-2xx responses in FintocApiError with the body and status', async () => {
      const fetchMock = vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(
            err(401, { error: { message: 'Invalid API key', type: 'invalid_request_error' } }),
          ),
        );
      const client = new FintocClient({ secretKey: 'sk_test_bad', fetch: fetchMock });

      await expect(client.listAccounts('link_abc')).rejects.toBeInstanceOf(FintocApiError);

      try {
        await client.listAccounts('link_abc');
      } catch (e) {
        const apiError = e as FintocApiError;
        expect(apiError.status).toBe(401);
        expect(apiError.message).toBe('Invalid API key');
      }
    });

    it('falls back to a generic message when the body has no error field', async () => {
      const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(err(500, '')));
      const client = new FintocClient({ secretKey: 'sk_test_123', fetch: fetchMock });

      try {
        await client.listAccounts('link_abc');
        expect.fail('expected listAccounts to throw');
      } catch (e) {
        const apiError = e as FintocApiError;
        expect(apiError.status).toBe(500);
        expect(apiError.message).toBe('Fintoc request failed: 500');
      }
    });
  });
});
