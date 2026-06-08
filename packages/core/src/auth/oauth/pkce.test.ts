/**
 * PKCE S256 (RFC 7636). Pure functions, no store. Guarantees: a correct verifier/challenge pair
 * validates; `plain` (or any method != S256) is rejected; malformed verifiers and non-matching
 * challenges are rejected; the derived challenge matches the client's reference computation.
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  deriveS256Challenge,
  isValidCodeChallenge,
  PKCE_METHOD_S256,
  verifyPkceS256,
} from './pkce.js';

// Valid verifier (43–128 chars of the unreserved alphabet).
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk-abcd1234EFGH';

describe('deriveS256Challenge', () => {
  it('matches the client-side base64url(sha256(verifier))', async () => {
    const expected = createHash('sha256').update(VERIFIER, 'utf8').digest('base64url');
    expect(await deriveS256Challenge(VERIFIER)).toBe(expected);
  });
});

describe('verifyPkceS256', () => {
  it('validates the correct pair', async () => {
    const challenge = await deriveS256Challenge(VERIFIER);
    expect(await verifyPkceS256(VERIFIER, challenge, PKCE_METHOD_S256)).toBe(true);
  });

  it('defaults the method to S256', async () => {
    const challenge = await deriveS256Challenge(VERIFIER);
    expect(await verifyPkceS256(VERIFIER, challenge)).toBe(true);
  });

  it('rejects the plain method', async () => {
    // Under 'plain' the challenge would be the verifier itself; it must still be rejected.
    expect(await verifyPkceS256(VERIFIER, VERIFIER, 'plain')).toBe(false);
  });

  it('rejects an unknown method', async () => {
    const challenge = await deriveS256Challenge(VERIFIER);
    expect(await verifyPkceS256(VERIFIER, challenge, 'S512')).toBe(false);
  });

  it('rejects a verifier that does not match the challenge', async () => {
    const challenge = await deriveS256Challenge(VERIFIER);
    expect(await verifyPkceS256(VERIFIER + 'x', challenge)).toBe(false);
  });

  it('rejects a malformed (too short) verifier', async () => {
    const short = 'abc';
    expect(await verifyPkceS256(short, await deriveS256Challenge(short))).toBe(false);
  });

  it('rejects a verifier with characters outside the alphabet', async () => {
    const bad = 'a'.repeat(50) + ' space';
    expect(await verifyPkceS256(bad, await deriveS256Challenge(bad))).toBe(false);
  });
});

describe('isValidCodeChallenge', () => {
  it('accepts a base64url challenge of valid length', async () => {
    expect(isValidCodeChallenge(await deriveS256Challenge(VERIFIER))).toBe(true);
  });
  it("rejects empty or '='-padded", () => {
    expect(isValidCodeChallenge('')).toBe(false);
    expect(isValidCodeChallenge('abc=')).toBe(false);
  });
});
