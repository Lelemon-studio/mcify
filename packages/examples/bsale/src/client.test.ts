import { describe, it, expect, vi } from 'vitest';
import { BsaleApiError, BsaleClient } from './client.js';

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

// Use a fixed unix timestamp so the date math is deterministic across
// runners. 1715126400 = 2024-05-08 00:00:00 UTC.
const FIXED_TIMESTAMP = 1715126400;

describe('BsaleClient', () => {
  it('throws when constructed without an access token', () => {
    // @ts-expect-error invalid construction
    expect(() => new BsaleClient({})).toThrow(/accessToken/);
  });

  describe('emitDte', () => {
    it('POSTs to /documents.json with the access_token header', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        ok({
          id: 99,
          number: 1234,
          emissionDate: FIXED_TIMESTAMP,
          totalAmount: 50000,
          document_type: { id: 33 },
          state: 0,
          urlPublicPdf: 'https://bsale.io/pdf/99.pdf',
        }),
      );

      const client = new BsaleClient({ accessToken: 'bs_test', fetch: fetchMock });

      const result = await client.emitDte({
        documentTypeId: 33,
        details: [{ netUnitValue: 50000, quantity: 1, description: 'Service' }],
        client: { code: '11.111.111-1', company: 'Acme SpA' },
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe('https://api.bsale.io/v1/documents.json');
      const reqInit = init as RequestInit;
      expect(reqInit.method).toBe('POST');
      const headers = reqInit.headers as Record<string, string>;
      expect(headers['access_token']).toBe('bs_test');
      expect(headers['content-type']).toBe('application/json');
      const body = JSON.parse(reqInit.body as string);
      expect(body.documentTypeId).toBe(33);
      expect(body.details[0].netUnitValue).toBe(50000);
      expect(body.details[0].comment).toBe('Service');
      expect(body.client.code).toBe('11.111.111-1');

      expect(result).toMatchObject({
        id: 99,
        number: 1234,
        documentTypeId: 33,
        status: 'accepted',
        urlPdf: 'https://bsale.io/pdf/99.pdf',
        emissionDate: '2024-05-08',
      });
    });
  });

  describe('listInvoices', () => {
    it('serializes filters as the lowercased query params Bsale expects', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        ok({
          href: '...',
          count: 1,
          limit: 10,
          offset: 0,
          items: [
            {
              id: 1,
              number: 100,
              emissionDate: FIXED_TIMESTAMP,
              totalAmount: 1000,
              document_type: { id: 33 },
              state: 0,
            },
          ],
        }),
      );

      const client = new BsaleClient({ accessToken: 'bs_test', fetch: fetchMock });
      const out = await client.listInvoices({
        limit: 10,
        emissionDateFrom: '2024-05-01',
        emissionDateTo: '2024-05-31',
        documentTypeId: 33,
      });

      const [url] = fetchMock.mock.calls[0]!;
      const parsed = new URL(url as string);
      expect(parsed.searchParams.get('limit')).toBe('10');
      expect(parsed.searchParams.get('emissiondatefrom')).toBe('2024-05-01');
      expect(parsed.searchParams.get('emissiondateto')).toBe('2024-05-31');
      expect(parsed.searchParams.get('documenttypeid')).toBe('33');

      expect(out).toHaveLength(1);
      expect(out[0]?.id).toBe(1);
      expect(out[0]?.status).toBe('accepted');
    });
  });

  describe('getInvoice', () => {
    it('GETs /documents/:id.json and unwraps the response', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        ok({
          id: 42,
          number: 7,
          emissionDate: FIXED_TIMESTAMP,
          totalAmount: 2500,
          document_type: { id: 39 },
          state: 1,
        }),
      );

      const client = new BsaleClient({ accessToken: 'bs_test', fetch: fetchMock });
      const out = await client.getInvoice(42);

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.bsale.io/v1/documents/42.json',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(out).toMatchObject({ id: 42, status: 'pending', documentTypeId: 39 });
    });
  });

  describe('listClients', () => {
    it('routes RUT-shaped queries to `code` and email-shaped to `email`', async () => {
      // Each call returns a fresh Response — `.text()` can only be read
      // once, so reusing a single instance across two `fetch()` calls
      // would surface the second body as empty.
      const fetchMock = vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(ok({ href: '...', count: 0, limit: 50, offset: 0, items: [] })),
        );

      const client = new BsaleClient({ accessToken: 'bs_test', fetch: fetchMock });
      await client.listClients('11.111.111-1');
      const [url1] = fetchMock.mock.calls[0]!;
      expect(new URL(url1 as string).searchParams.get('code')).toBe('11.111.111-1');

      await client.listClients('foo@example.com');
      const [url2] = fetchMock.mock.calls[1]!;
      expect(new URL(url2 as string).searchParams.get('email')).toBe('foo@example.com');
    });
  });

  describe('error handling', () => {
    it('wraps non-2xx responses in BsaleApiError with the body and status', async () => {
      const fetchMock = vi
        .fn()
        .mockImplementation(() => Promise.resolve(err(401, { error: 'Token de acceso inválido' })));
      const client = new BsaleClient({ accessToken: 'bs_test', fetch: fetchMock });

      await expect(client.getInvoice(1)).rejects.toBeInstanceOf(BsaleApiError);

      try {
        await client.getInvoice(1);
      } catch (e) {
        const apiError = e as BsaleApiError;
        expect(apiError.status).toBe(401);
        expect(apiError.message).toBe('Token de acceso inválido');
        expect(apiError.body).toEqual({ error: 'Token de acceso inválido' });
      }
    });
  });
});
