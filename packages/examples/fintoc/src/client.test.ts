import { describe, it, expect, vi } from 'vitest';
import { FintocApiError, FintocClient } from './client.js';

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

const sampleMovement = {
  id: 'mov_1',
  amount: -25000,
  currency: 'CLP',
  post_date: '2024-05-08',
  description: 'Transferencia a proveedor',
  recipient_account: { holder_id: '22.222.222-2', holder_name: 'Proveedor' },
  type: 'transfer' as const,
  pending: false,
};

describe('FintocClient', () => {
  it('throws when constructed without a secret key', () => {
    // @ts-expect-error invalid construction
    expect(() => new FintocClient({})).toThrow(/secretKey/);
  });

  describe('listAccounts', () => {
    it('GETs /accounts with link_token in the query and Authorization header', async () => {
      const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(ok([sampleAccount])));
      const client = new FintocClient({ secretKey: 'sk_test_123', fetch: fetchMock });

      const out = await client.listAccounts('link_abc');

      const [url, init] = fetchMock.mock.calls[0]!;
      const parsed = new URL(url as string);
      expect(parsed.pathname).toBe('/v1/accounts');
      expect(parsed.searchParams.get('link_token')).toBe('link_abc');
      const headers = (init as RequestInit).headers as Record<string, string>;
      // Fintoc uses the secret key directly — no `Bearer` prefix.
      expect(headers.Authorization).toBe('sk_test_123');

      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({
        id: 'acc_1',
        officialName: 'Cuenta Corriente Pesos',
        holderId: '11.111.111-1',
        balance: { available: 100000, current: 105000 },
      });
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
    it('forwards date range and per_page filters', async () => {
      const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(ok([sampleMovement])));
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

      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({
        id: 'mov_1',
        amount: -25000,
        recipientAccount: { holderId: '22.222.222-2', holderName: 'Proveedor' },
      });
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
