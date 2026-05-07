import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyMercadoPagoWebhookSignature } from './webhook.js';

const SECRET = 'whsec_mp_test';
const DATA_ID = '9999';
const REQUEST_ID = 'req_uuid_abc';

const signed = (ts: number, dataId: string, requestId: string, secret: string): string => {
  const template = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const hex = createHmac('sha256', secret).update(template).digest('hex');
  return `ts=${ts},v1=${hex}`;
};

describe('verifyMercadoPagoWebhookSignature', () => {
  it('verifies a correctly-signed notification within tolerance', () => {
    const ts = 1_700_000_000;
    const header = signed(ts, DATA_ID, REQUEST_ID, SECRET);
    expect(
      verifyMercadoPagoWebhookSignature(
        {
          dataId: DATA_ID,
          requestId: REQUEST_ID,
          signatureHeader: header,
          secret: SECRET,
        },
        { nowSeconds: ts + 30 },
      ),
    ).toBe(true);
  });

  it('rejects when dataId is tampered', () => {
    const ts = 1_700_000_000;
    const header = signed(ts, DATA_ID, REQUEST_ID, SECRET);
    expect(
      verifyMercadoPagoWebhookSignature(
        {
          dataId: 'attacker_id',
          requestId: REQUEST_ID,
          signatureHeader: header,
          secret: SECRET,
        },
        { nowSeconds: ts + 30 },
      ),
    ).toBe(false);
  });

  it('rejects when requestId is tampered', () => {
    const ts = 1_700_000_000;
    const header = signed(ts, DATA_ID, REQUEST_ID, SECRET);
    expect(
      verifyMercadoPagoWebhookSignature(
        {
          dataId: DATA_ID,
          requestId: 'attacker_req',
          signatureHeader: header,
          secret: SECRET,
        },
        { nowSeconds: ts + 30 },
      ),
    ).toBe(false);
  });

  it('rejects when secret is wrong', () => {
    const ts = 1_700_000_000;
    const header = signed(ts, DATA_ID, REQUEST_ID, 'whsec_other');
    expect(
      verifyMercadoPagoWebhookSignature(
        {
          dataId: DATA_ID,
          requestId: REQUEST_ID,
          signatureHeader: header,
          secret: SECRET,
        },
        { nowSeconds: ts + 30 },
      ),
    ).toBe(false);
  });

  it('rejects when timestamp is outside tolerance', () => {
    const ts = 1_700_000_000;
    const header = signed(ts, DATA_ID, REQUEST_ID, SECRET);
    expect(
      verifyMercadoPagoWebhookSignature(
        {
          dataId: DATA_ID,
          requestId: REQUEST_ID,
          signatureHeader: header,
          secret: SECRET,
        },
        { nowSeconds: ts + 600, toleranceSeconds: 300 },
      ),
    ).toBe(false);
  });

  it('rejects empty / missing inputs', () => {
    const base = {
      dataId: DATA_ID,
      requestId: REQUEST_ID,
      signatureHeader: 'ts=1,v1=abc',
      secret: SECRET,
    };
    expect(verifyMercadoPagoWebhookSignature({ ...base, signatureHeader: null })).toBe(false);
    expect(verifyMercadoPagoWebhookSignature({ ...base, dataId: '' })).toBe(false);
    expect(verifyMercadoPagoWebhookSignature({ ...base, requestId: '' })).toBe(false);
    expect(verifyMercadoPagoWebhookSignature({ ...base, secret: '' })).toBe(false);
  });

  it('rejects malformed signature header', () => {
    const base = {
      dataId: DATA_ID,
      requestId: REQUEST_ID,
      secret: SECRET,
    };
    expect(verifyMercadoPagoWebhookSignature({ ...base, signatureHeader: 'broken' })).toBe(false);
    expect(verifyMercadoPagoWebhookSignature({ ...base, signatureHeader: 'ts=,v1=' })).toBe(false);
  });
});
