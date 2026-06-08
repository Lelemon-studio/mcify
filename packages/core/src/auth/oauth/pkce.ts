import { constantTimeEqual, sha256Base64Url } from './crypto.js';

/**
 * PKCE (RFC 7636) for the OAuth authorization server. Only `S256` is supported — `plain` is
 * forbidden (OAuth 2.1 deprecates it; a public client without S256 nullifies the protection).
 * The authorize step stores the `code_challenge`; the token endpoint receives the `code_verifier`
 * and here we check `base64url(sha256(code_verifier)) === code_challenge`.
 */

/** The only accepted method. Advertised as such in the RFC 8414 metadata. */
export const PKCE_METHOD_S256 = 'S256' as const;
export type PkceMethod = typeof PKCE_METHOD_S256;

/** The `code_verifier` must be 43–128 chars from the unreserved alphabet (RFC 7636 §4.1). */
const VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;

/** Derives the S256 `code_challenge` from a `code_verifier` (exactly as the client does). */
export async function deriveS256Challenge(codeVerifier: string): Promise<string> {
  return sha256Base64Url(codeVerifier);
}

/**
 * Verifies a (`code_verifier`, `code_challenge`) pair under S256, in constant time. Returns
 * `false` if the method is not S256, the verifier is malformed, or the derived challenge does
 * not match. Never throws.
 */
export async function verifyPkceS256(
  codeVerifier: string,
  storedChallenge: string,
  method: string = PKCE_METHOD_S256,
): Promise<boolean> {
  if (method !== PKCE_METHOD_S256) return false;
  if (!VERIFIER_RE.test(codeVerifier)) return false;
  const derived = await deriveS256Challenge(codeVerifier);
  return constantTimeEqual(derived, storedChallenge);
}

/** Validates that a `code_challenge` received at /authorize is a non-empty base64url string. */
export function isValidCodeChallenge(challenge: string): boolean {
  return /^[A-Za-z0-9\-_]{43,128}$/.test(challenge);
}
