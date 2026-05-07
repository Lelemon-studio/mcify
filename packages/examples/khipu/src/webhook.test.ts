import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { parseKhipuNotification, verifyKhipuWebhookSignature } from './webhook.js';

const SECRET = 'whsec_test_xyz';
const BODY = 'api_version=1.3&notification_token=abcdef1234567890';

const signed = (timestamp: number, body: string, secret: string): string => {
  const hex = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${hex}`;
};

describe('verifyKhipuWebhookSignature', () => {
  it('verifies a correctly-signed body within the tolerance window', () => {
    const ts = 1_700_000_000;
    const header = signed(ts, BODY, SECRET);
    expect(verifyKhipuWebhookSignature(BODY, header, SECRET, { nowSeconds: ts + 30 })).toBe(true);
  });

  it('rejects when the body has been tampered', () => {
    const ts = 1_700_000_000;
    const header = signed(ts, BODY, SECRET);
    const tamperedBody = BODY.replace('abcdef1234567890', 'ATTACKER000000000');
    expect(verifyKhipuWebhookSignature(tamperedBody, header, SECRET, { nowSeconds: ts + 30 })).toBe(
      false,
    );
  });

  it('rejects when the signature was made with a different secret', () => {
    const ts = 1_700_000_000;
    const header = signed(ts, BODY, 'whsec_different');
    expect(verifyKhipuWebhookSignature(BODY, header, SECRET, { nowSeconds: ts + 30 })).toBe(false);
  });

  it('rejects when the timestamp is outside the tolerance window', () => {
    const ts = 1_700_000_000;
    const header = signed(ts, BODY, SECRET);
    expect(
      verifyKhipuWebhookSignature(BODY, header, SECRET, {
        nowSeconds: ts + 600,
        toleranceSeconds: 300,
      }),
    ).toBe(false);
  });

  it('rejects an empty / missing signature header', () => {
    expect(verifyKhipuWebhookSignature(BODY, null, SECRET)).toBe(false);
    expect(verifyKhipuWebhookSignature(BODY, undefined, SECRET)).toBe(false);
    expect(verifyKhipuWebhookSignature(BODY, '', SECRET)).toBe(false);
  });

  it('rejects a malformed signature header', () => {
    expect(verifyKhipuWebhookSignature(BODY, 'not-a-real-header', SECRET)).toBe(false);
    expect(verifyKhipuWebhookSignature(BODY, 't=,v1=', SECRET)).toBe(false);
    expect(verifyKhipuWebhookSignature(BODY, 'v1=abc', SECRET)).toBe(false);
  });

  it('rejects when the secret is empty', () => {
    const ts = 1_700_000_000;
    const header = signed(ts, BODY, SECRET);
    expect(verifyKhipuWebhookSignature(BODY, header, '', { nowSeconds: ts })).toBe(false);
  });
});

describe('parseKhipuNotification', () => {
  it('parses a v3 notification body', () => {
    const result = parseKhipuNotification('api_version=3.0&notification_token=tok_xyz');
    expect(result).toEqual({
      notificationToken: 'tok_xyz',
      apiVersion: '3.0',
      body: { api_version: '3.0', notification_token: 'tok_xyz' },
    });
  });

  it('returns null when notification_token is missing', () => {
    expect(parseKhipuNotification('api_version=3.0')).toBeNull();
  });

  it('decodes URL-encoded values', () => {
    const result = parseKhipuNotification('notification_token=tok%5Fxyz&extra=%C3%A1%C3%A9');
    expect(result?.notificationToken).toBe('tok_xyz');
    expect(result?.body.extra).toBe('áé');
  });
});
