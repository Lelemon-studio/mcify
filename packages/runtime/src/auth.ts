import type { AuthConfig, AuthState } from '@mcify/core';

export class McifyAuthError extends Error {
  override readonly name = 'McifyAuthError';
  constructor(
    message: string,
    public readonly status: 401 | 403 = 401,
  ) {
    super(message);
  }
}

export type EnvSource = Record<string, string | undefined>;

export const getProcessEnv = (): EnvSource => {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env ?? {};
};

const headerLookup = (headers: Headers, name: string): string | null =>
  headers.get(name) ?? headers.get(name.toLowerCase());

/**
 * Constant-time string comparison. Avoids leaking the matched prefix length
 * via timing analysis. Length difference is observable — the industry consensus
 * is that this is acceptable for token verification (cf. `crypto.timingSafeEqual`).
 *
 * Implemented in pure JS (no Web Crypto, no Node `crypto`) so it runs unchanged
 * on Node, Bun, Deno, and Cloudflare Workers.
 */
export const constantTimeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
};

export const resolveAuthFromHeaders = async (
  authConfig: AuthConfig | undefined,
  headers: Headers,
  env: EnvSource = getProcessEnv(),
): Promise<AuthState> => {
  if (!authConfig || authConfig.type === 'none') {
    return { type: 'none' };
  }

  if (authConfig.type === 'bearer') {
    const header = headerLookup(headers, 'authorization');
    if (!header || !header.startsWith('Bearer ')) {
      throw new McifyAuthError('Missing or malformed Authorization header (expected Bearer)');
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) throw new McifyAuthError('Empty Bearer token');

    if (authConfig.verify) {
      const ok = await authConfig.verify(token);
      if (!ok) throw new McifyAuthError('Invalid Bearer token');
    } else {
      const expected = env[authConfig.env];
      if (!expected || !constantTimeEqual(token, expected)) {
        throw new McifyAuthError('Invalid Bearer token');
      }
    }
    return { type: 'bearer', token };
  }

  if (authConfig.type === 'api_key') {
    const key = headerLookup(headers, authConfig.headerName);
    if (!key) {
      throw new McifyAuthError(`Missing ${authConfig.headerName} header`);
    }
    if (authConfig.verify) {
      const ok = await authConfig.verify(key);
      if (!ok) throw new McifyAuthError('Invalid API key');
    } else {
      const expected = env[authConfig.env];
      if (!expected || !constantTimeEqual(key, expected)) {
        throw new McifyAuthError('Invalid API key');
      }
    }
    return { type: 'api_key', key, headerName: authConfig.headerName };
  }

  if (authConfig.type === 'oauth') {
    throw new McifyAuthError(
      'OAuth handshake not yet supported in runtime — provide a verified token via Bearer instead',
      401,
    );
  }

  return { type: 'none' };
};
