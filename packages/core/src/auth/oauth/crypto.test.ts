/**
 * Web Crypto primitives. Verifies the base64url SHA-256 matches Node's reference output, tokens
 * are high-entropy base64url, and the constant-time compare behaves like equality.
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { constantTimeEqual, randomToken, sha256Base64Url } from './crypto.js';

describe('sha256Base64Url', () => {
  it('matches node:crypto base64url (no padding)', async () => {
    const input = 'the-quick-brown-fox-0123456789';
    const expected = createHash('sha256').update(input, 'utf8').digest('base64url');
    expect(await sha256Base64Url(input)).toBe(expected);
  });

  it('is deterministic and contains no base64 padding/url-unsafe chars', async () => {
    const a = await sha256Base64Url('x');
    const b = await sha256Base64Url('x');
    expect(a).toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('randomToken', () => {
  it('is base64url and high-entropy (distinct across calls)', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => randomToken()));
    expect(tokens.size).toBe(100);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('honors the byte length (32 bytes → 43 base64url chars)', () => {
    expect(randomToken(32).length).toBe(43);
    expect(randomToken(16).length).toBe(22);
  });
});

describe('constantTimeEqual', () => {
  it('is true for equal strings, false otherwise', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
    expect(constantTimeEqual('', '')).toBe(true);
  });
});
