/**
 * Crypto primitives for the OAuth 2.1 authorization server, implemented on **Web Crypto**
 * (`globalThis.crypto`) so they run unchanged on Node, Bun, Deno, and Cloudflare Workers.
 *
 * Deliberately NOT `node:crypto` — mcify's cross-runtime promise forbids it. The reference
 * implementation (PlataformaContable) used `node:crypto`; here `sha256Base64Url` is therefore
 * async (`crypto.subtle.digest` returns a Promise) and callers `await` it.
 *
 * No `Buffer`, no `btoa`, no DOM lib: base64url is encoded by hand from bytes (`lib: ES2022`
 * in core does not include DOM, and Workers has no `Buffer`).
 */

interface WebCryptoLike {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
  readonly subtle: {
    digest(algorithm: string, data: ArrayBufferView | ArrayBuffer): Promise<ArrayBuffer>;
  };
}

interface TextEncoderLike {
  encode(input: string): Uint8Array;
}

const getWebCrypto = (): WebCryptoLike => {
  const c = (globalThis as { crypto?: WebCryptoLike }).crypto;
  if (!c?.subtle || typeof c.getRandomValues !== 'function') {
    throw new Error('Web Crypto (globalThis.crypto.subtle) is unavailable in this runtime');
  }
  return c;
};

const getTextEncoder = (): TextEncoderLike => {
  const TE = (globalThis as { TextEncoder?: new () => TextEncoderLike }).TextEncoder;
  if (!TE) throw new Error('TextEncoder is unavailable in this runtime');
  return new TE();
};

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** base64url **without padding** (matches Node's `digest('base64url')` / `toString('base64url')`). */
function bytesToBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const hasB1 = i + 1 < bytes.length;
    const hasB2 = i + 2 < bytes.length;
    const b1 = hasB1 ? (bytes[i + 1] ?? 0) : 0;
    const b2 = hasB2 ? (bytes[i + 2] ?? 0) : 0;
    out += B64URL[b0 >> 2];
    out += B64URL[((b0 & 0b11) << 4) | (b1 >> 4)];
    if (hasB1) out += B64URL[((b1 & 0b1111) << 2) | (b2 >> 6)];
    if (hasB2) out += B64URL[b2 & 0b111111];
  }
  return out;
}

/**
 * High-entropy opaque token in base64url (access/refresh tokens and authorization codes).
 * 32 bytes = 256 bits. The plaintext is handed to the client only at issuance; the store
 * keeps its {@link sha256Base64Url}.
 */
export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  getWebCrypto().getRandomValues(buf);
  return bytesToBase64Url(buf);
}

/**
 * SHA-256 in base64url (no padding). Used to (a) store tokens/codes hashed — looked up by a
 * unique index, never in cleartext — and (b) derive the PKCE S256 `code_challenge` from the
 * `code_verifier` (RFC 7636). One-way; no reversibility needed.
 */
export async function sha256Base64Url(input: string): Promise<string> {
  const data = getTextEncoder().encode(input);
  const digest = await getWebCrypto().subtle.digest('SHA-256', data);
  return bytesToBase64Url(new Uint8Array(digest));
}

/**
 * Constant-time string comparison (pure JS — no Web Crypto, runs everywhere). A length
 * difference is observable; that is the industry-accepted tradeoff (cf. `timingSafeEqual`).
 * Used to compare PKCE challenges and hashed-token lookups where applicable.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
