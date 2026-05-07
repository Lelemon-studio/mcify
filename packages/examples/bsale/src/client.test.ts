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

// Fixed unix timestamp (seconds, GMT) — 2024-05-08 00:00:00 UTC.
const FIXED_TS = 1715126400;

describe('BsaleClient', () => {
  it('throws when constructed without an access token', () => {
    // @ts-expect-error invalid construction
    expect(() => new BsaleClient({})).toThrow(/accessToken/);
  });

  describe('emitDte', () => {
    it('POSTs to /documents.json with the access_token header (literal, no Bearer)', async () => {
      const fetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve(
          ok({
            id: 99,
            number: 1234,
            emissionDate: FIXED_TS,
            totalAmount: 50000,
            netAmount: 42017,
            taxAmount: 7983,
            document_type: { id: 33 },
            state: 0,
            informedSii: 0,
            urlPdf: 'https://bsale.io/pdf/99.pdf',
            urlPublicView: 'https://bsale.io/v/99',
          }),
        ),
      );

      const client = new BsaleClient({ accessToken: 'bs_test', fetch: fetchMock });

      const result = await client.emitDte({
        documentTypeId: 33,
        details: [{ netUnitValue: 42017, quantity: 1, description: 'Service', taxId: [1, 2] }],
        client: { code: '11.111.111-1', company: 'Acme SpA' },
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe('https://api.bsale.io/v1/documents.json');
      const reqInit = init as RequestInit;
      expect(reqInit.method).toBe('POST');
      const headers = reqInit.headers as Record<string, string>;
      // Literal `access_token` header per Bsale docs — NOT Authorization Bearer.
      expect(headers['access_token']).toBe('bs_test');
      expect(headers['Authorization']).toBeUndefined();
      const body = JSON.parse(reqInit.body as string);
      expect(body.documentTypeId).toBe(33);
      expect(body.details[0].netUnitValue).toBe(42017);
      expect(body.details[0].comment).toBe('Service');
      // Bsale's quirk: taxId is a string with bracketed CSV.
      expect(body.details[0].taxId).toBe('[1,2]');
      expect(body.client.code).toBe('11.111.111-1');

      expect(result).toMatchObject({
        id: 99,
        number: 1234,
        documentTypeId: 33,
        lifecycle: 'active',
        siiStatus: 'correct',
        urlPdf: 'https://bsale.io/pdf/99.pdf',
        urlPublicView: 'https://bsale.io/v/99',
        emissionDate: '2024-05-08',
        netAmount: 42017,
        taxAmount: 7983,
      });
    });

    it('converts emissionDate (YYYY-MM-DD) to a unix timestamp in GMT', async () => {
      const fetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve(
          ok({
            id: 1,
            number: 1,
            emissionDate: FIXED_TS,
            totalAmount: 0,
            document_type: { id: 33 },
            state: 0,
            informedSii: 0,
          }),
        ),
      );
      const client = new BsaleClient({ accessToken: 'bs_test', fetch: fetchMock });

      await client.emitDte({
        documentTypeId: 33,
        emissionDate: '2024-05-08',
        details: [{ netUnitValue: 100, quantity: 1 }],
        client: { code: '11.111.111-1' },
      });

      const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
      // 2024-05-08 00:00:00 UTC = 1715126400.
      expect(body.emissionDate).toBe(FIXED_TS);
    });

    it('forwards optional fields (officeId, declareSii, salesId, expirationDate)', async () => {
      const fetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve(
          ok({
            id: 1,
            number: 1,
            emissionDate: FIXED_TS,
            totalAmount: 0,
            document_type: { id: 33 },
            state: 0,
            informedSii: 0,
          }),
        ),
      );
      const client = new BsaleClient({ accessToken: 'bs_test', fetch: fetchMock });

      await client.emitDte({
        documentTypeId: 33,
        officeId: 7,
        declareSii: 0,
        salesId: 'order-42',
        expirationDate: '2024-06-08',
        details: [{ netUnitValue: 100, quantity: 1 }],
        clientId: 5,
      });

      const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
      expect(body.officeId).toBe(7);
      expect(body.declareSii).toBe(0);
      expect(body.salesId).toBe('order-42');
      expect(body.expirationDate).toBe(Date.UTC(2024, 5, 8) / 1000);
      expect(body.clientId).toBe(5);
    });
  });

  describe('listInvoices', () => {
    it("serializes date range as Bsale's emissiondaterange=[from,to] with timestamps", async () => {
      const fetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve(
          ok({
            href: '...',
            count: 1,
            limit: 10,
            offset: 0,
            items: [
              {
                id: 1,
                number: 100,
                emissionDate: FIXED_TS,
                totalAmount: 1000,
                document_type: { id: 33 },
                state: 0,
                informedSii: 1,
              },
            ],
          }),
        ),
      );

      const client = new BsaleClient({ accessToken: 'bs_test', fetch: fetchMock });
      const out = await client.listInvoices({
        limit: 10,
        emissionDateFrom: '2024-05-01',
        emissionDateTo: '2024-05-31',
        documentTypeId: 33,
        codeSii: 33,
      });

      const [url] = fetchMock.mock.calls[0]!;
      const parsed = new URL(url as string);
      expect(parsed.searchParams.get('limit')).toBe('10');
      // emissiondaterange=[from,to], each side a unix timestamp in GMT.
      const fromTs = Date.UTC(2024, 4, 1) / 1000;
      const toTs = Date.UTC(2024, 4, 31) / 1000;
      expect(parsed.searchParams.get('emissiondaterange')).toBe(`[${fromTs},${toTs}]`);
      // emissiondatefrom/to don't exist in Bsale.
      expect(parsed.searchParams.has('emissiondatefrom')).toBe(false);
      expect(parsed.searchParams.has('emissiondateto')).toBe(false);
      expect(parsed.searchParams.get('documenttypeid')).toBe('33');
      expect(parsed.searchParams.get('codesii')).toBe('33');

      expect(out).toHaveLength(1);
      expect(out[0]?.id).toBe(1);
      expect(out[0]?.lifecycle).toBe('active');
      expect(out[0]?.siiStatus).toBe('sent');
    });
  });

  describe('getInvoice', () => {
    it('GETs /documents/:id.json and unwraps the response with both lifecycle and siiStatus', async () => {
      const fetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve(
          ok({
            id: 42,
            number: 7,
            emissionDate: FIXED_TS,
            totalAmount: 2500,
            document_type: { id: 39 },
            state: 1, // inactive (deleted/voided)
            informedSii: 2, // rejected by SII
          }),
        ),
      );

      const client = new BsaleClient({ accessToken: 'bs_test', fetch: fetchMock });
      const out = await client.getInvoice(42);

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.bsale.io/v1/documents/42.json',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(out).toMatchObject({
        id: 42,
        documentTypeId: 39,
        lifecycle: 'inactive',
        siiStatus: 'rejected',
      });
    });
  });

  describe('listClients', () => {
    it('routes RUT-shaped queries to `code` and email-shaped to `email`', async () => {
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
