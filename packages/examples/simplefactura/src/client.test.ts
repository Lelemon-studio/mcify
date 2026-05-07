import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SimpleFacturaApiError, SimpleFacturaClient } from './client.js';

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

const futureIso = (msFromNow: number): string => new Date(Date.now() + msFromNow).toISOString();

describe('SimpleFacturaClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-07T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('construction', () => {
    it('throws when constructed without email or password', () => {
      // @ts-expect-error invalid construction
      expect(() => new SimpleFacturaClient({})).toThrow(/email.*password/);
    });
  });

  describe('auth flow', () => {
    it('POSTs /token on first request and Bearers the JWT in the follow-up call', async () => {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url.endsWith('/token')) {
          return Promise.resolve(
            ok({ accessToken: 'jwt-1', expiresAt: futureIso(60 * 60 * 1000) }),
          );
        }
        return Promise.resolve(ok({ status: 200, data: { ok: true } }));
      });

      const client = new SimpleFacturaClient({
        email: 'demo@chilesystems.com',
        password: 'Rv8Il4eV',
        fetch: fetchMock,
      });

      const result = await client.post<unknown, { ok: boolean }>('/clients', { foo: 'bar' });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const tokenCall = fetchMock.mock.calls[0]!;
      expect(tokenCall[0]).toBe('https://api.simplefactura.cl/token');
      const tokenInit = tokenCall[1] as RequestInit;
      expect(tokenInit.method).toBe('POST');
      expect(JSON.parse(tokenInit.body as string)).toEqual({
        email: 'demo@chilesystems.com',
        password: 'Rv8Il4eV',
      });

      const businessCall = fetchMock.mock.calls[1]!;
      expect(businessCall[0]).toBe('https://api.simplefactura.cl/clients');
      const businessInit = businessCall[1] as RequestInit;
      const headers = businessInit.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer jwt-1');
      expect(headers.Accept).toBe('application/json');

      expect(result.data).toEqual({ ok: true });
    });

    it('reuses a cached token while it is still valid', async () => {
      const fetchMock = vi
        .fn()
        .mockImplementation(() => Promise.resolve(ok({ status: 200, data: {} })));

      const client = new SimpleFacturaClient({
        email: 'a@b',
        password: 'p',
        cachedToken: { accessToken: 'jwt-cached', expiresAt: futureIso(30 * 60 * 1000) },
        fetch: fetchMock,
      });

      await client.post('/clients', {});
      await client.post('/products', {});

      // No /token call — we used the cache for both.
      expect(fetchMock).toHaveBeenCalledTimes(2);
      for (const call of fetchMock.mock.calls) {
        const headers = (call[1] as RequestInit).headers as Record<string, string>;
        expect(headers.Authorization).toBe('Bearer jwt-cached');
      }
    });

    it('refreshes the token when it is within the skew window', async () => {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url.endsWith('/token')) {
          return Promise.resolve(
            ok({ accessToken: 'jwt-fresh', expiresAt: futureIso(60 * 60 * 1000) }),
          );
        }
        return Promise.resolve(ok({ status: 200, data: {} }));
      });

      const client = new SimpleFacturaClient({
        email: 'a@b',
        password: 'p',
        // Token expires in 30 seconds — inside the default 60s skew.
        cachedToken: { accessToken: 'jwt-stale', expiresAt: futureIso(30_000) },
        fetch: fetchMock,
      });

      await client.post('/clients', {});

      // /token + /clients
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const businessCall = fetchMock.mock.calls[1]!;
      const headers = (businessCall[1] as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer jwt-fresh');
    });

    it('calls onTokenRefreshed when a new token is obtained', async () => {
      const onTokenRefreshed = vi.fn();
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url.endsWith('/token')) {
          return Promise.resolve(ok({ accessToken: 'jwt-1', expiresAt: '2026-05-08T12:00:00Z' }));
        }
        return Promise.resolve(ok({ status: 200, data: {} }));
      });

      const client = new SimpleFacturaClient({
        email: 'a@b',
        password: 'p',
        fetch: fetchMock,
        onTokenRefreshed,
      });

      await client.post('/clients', {});

      expect(onTokenRefreshed).toHaveBeenCalledTimes(1);
      expect(onTokenRefreshed).toHaveBeenCalledWith({
        accessToken: 'jwt-1',
        expiresAt: '2026-05-08T12:00:00Z',
      });
    });

    it('serialises concurrent requests behind a single token refresh', async () => {
      let tokenCalls = 0;
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url.endsWith('/token')) {
          tokenCalls++;
          return Promise.resolve(
            ok({ accessToken: 'jwt-shared', expiresAt: futureIso(60 * 60 * 1000) }),
          );
        }
        return Promise.resolve(ok({ status: 200, data: {} }));
      });

      const client = new SimpleFacturaClient({ email: 'a@b', password: 'p', fetch: fetchMock });
      await Promise.all([
        client.post('/clients', {}),
        client.post('/products', {}),
        client.post('/branchOffices', {}),
      ]);

      expect(tokenCalls).toBe(1);
    });

    it('retries once on 401 by forcing a fresh token', async () => {
      let businessCalls = 0;
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url.endsWith('/token')) {
          return Promise.resolve(
            ok({ accessToken: `jwt-${Math.random()}`, expiresAt: futureIso(60 * 60 * 1000) }),
          );
        }
        businessCalls++;
        if (businessCalls === 1) {
          return Promise.resolve(err(401, { message: 'Token expired' }));
        }
        return Promise.resolve(ok({ status: 200, data: { retried: true } }));
      });

      const client = new SimpleFacturaClient({
        email: 'a@b',
        password: 'p',
        cachedToken: { accessToken: 'jwt-stale', expiresAt: futureIso(60 * 60 * 1000) },
        fetch: fetchMock,
      });

      const out = await client.post<unknown, { retried: boolean }>('/clients', {});
      expect(out.data.retried).toBe(true);
    });
  });

  describe('error handling', () => {
    it('wraps non-2xx responses in SimpleFacturaApiError with status, message, errors', async () => {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url.endsWith('/token')) {
          return Promise.resolve(ok({ accessToken: 'jwt', expiresAt: futureIso(60 * 60 * 1000) }));
        }
        return Promise.resolve(
          err(400, { message: 'RUT inválido', errors: ['rutEmisor: formato incorrecto'] }),
        );
      });

      const client = new SimpleFacturaClient({ email: 'a@b', password: 'p', fetch: fetchMock });

      try {
        await client.post('/invoiceV2/default', {});
        expect.fail('expected request to throw');
      } catch (e) {
        expect(e).toBeInstanceOf(SimpleFacturaApiError);
        const apiError = e as SimpleFacturaApiError;
        expect(apiError.status).toBe(400);
        expect(apiError.message).toBe('RUT inválido');
        expect(apiError.errors).toEqual(['rutEmisor: formato incorrecto']);
      }
    });

    it('surfaces /token failure with descriptive message', async () => {
      const fetchMock = vi
        .fn()
        .mockImplementation(() => Promise.resolve(err(401, { message: 'Credenciales inválidas' })));

      const client = new SimpleFacturaClient({ email: 'a@b', password: 'wrong', fetch: fetchMock });

      try {
        await client.post('/clients', {});
        expect.fail('expected /token to throw');
      } catch (e) {
        expect(e).toBeInstanceOf(SimpleFacturaApiError);
        const apiError = e as SimpleFacturaApiError;
        expect(apiError.status).toBe(401);
        expect(apiError.message).toBe('Credenciales inválidas');
      }
    });
  });

  describe('postForBytes', () => {
    it('returns the raw bytes when the endpoint sends a binary payload', async () => {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url.endsWith('/token')) {
          return Promise.resolve(ok({ accessToken: 'jwt', expiresAt: futureIso(60 * 60 * 1000) }));
        }
        const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
        return Promise.resolve(
          new Response(bytes, {
            status: 200,
            headers: { 'content-type': 'application/pdf' },
          }),
        );
      });

      const client = new SimpleFacturaClient({ email: 'a@b', password: 'p', fetch: fetchMock });
      const out = await client.postForBytes('/dte/pdf', { foo: 'bar' });

      expect(out).toBeInstanceOf(Uint8Array);
      expect(Array.from(out)).toEqual([0x25, 0x50, 0x44, 0x46]);
    });
  });
});
