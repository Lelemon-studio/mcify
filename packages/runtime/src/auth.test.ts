import { describe, it, expect } from 'vitest';
import { auth, bearer, apiKey } from '@mcify/core';
import { McifyAuthError, resolveAuthFromHeaders } from './auth.js';

describe('resolveAuthFromHeaders', () => {
  describe('none / undefined config', () => {
    it('returns { type: none } when config is undefined', async () => {
      expect(await resolveAuthFromHeaders(undefined, new Headers())).toEqual({ type: 'none' });
    });
    it('returns { type: none } for auth.none() config', async () => {
      expect(await resolveAuthFromHeaders(auth.none(), new Headers())).toEqual({ type: 'none' });
    });
  });

  describe('bearer', () => {
    it('accepts a matching env-var token', async () => {
      const cfg = bearer({ env: 'TOKEN' });
      const headers = new Headers({ authorization: 'Bearer secret-1' });
      const state = await resolveAuthFromHeaders(cfg, headers, { TOKEN: 'secret-1' });
      expect(state).toEqual({ type: 'bearer', token: 'secret-1' });
    });

    it('rejects a mismatched token', async () => {
      const cfg = bearer({ env: 'TOKEN' });
      const headers = new Headers({ authorization: 'Bearer wrong' });
      await expect(
        resolveAuthFromHeaders(cfg, headers, { TOKEN: 'secret-1' }),
      ).rejects.toBeInstanceOf(McifyAuthError);
    });

    it('rejects when Authorization header is missing', async () => {
      const cfg = bearer({ env: 'TOKEN' });
      await expect(
        resolveAuthFromHeaders(cfg, new Headers(), { TOKEN: 'secret-1' }),
      ).rejects.toBeInstanceOf(McifyAuthError);
    });

    it('rejects when Authorization is not Bearer', async () => {
      const cfg = bearer({ env: 'TOKEN' });
      const headers = new Headers({ authorization: 'Basic dXNlcjpwYXNz' });
      await expect(
        resolveAuthFromHeaders(cfg, headers, { TOKEN: 'secret-1' }),
      ).rejects.toBeInstanceOf(McifyAuthError);
    });

    it('uses verify callback when provided', async () => {
      let seen = '';
      const cfg = bearer({
        env: 'TOKEN',
        verify: async (t) => {
          seen = t;
          return t.startsWith('ok-');
        },
      });
      const headers = new Headers({ authorization: 'Bearer ok-123' });
      const state = await resolveAuthFromHeaders(cfg, headers, {});
      expect(seen).toBe('ok-123');
      expect(state).toEqual({ type: 'bearer', token: 'ok-123' });
    });

    it('rejects when verify returns false', async () => {
      const cfg = bearer({ env: 'TOKEN', verify: () => false });
      const headers = new Headers({ authorization: 'Bearer something' });
      await expect(resolveAuthFromHeaders(cfg, headers, {})).rejects.toBeInstanceOf(McifyAuthError);
    });
  });

  describe('apiKey', () => {
    it('accepts a matching env-var key', async () => {
      const cfg = apiKey({ headerName: 'X-Api-Key', env: 'KEY' });
      const headers = new Headers({ 'x-api-key': 'k-1' });
      const state = await resolveAuthFromHeaders(cfg, headers, { KEY: 'k-1' });
      expect(state).toEqual({ type: 'api_key', key: 'k-1', headerName: 'X-Api-Key' });
    });

    it('rejects when header is missing', async () => {
      const cfg = apiKey({ headerName: 'X-Api-Key', env: 'KEY' });
      await expect(
        resolveAuthFromHeaders(cfg, new Headers(), { KEY: 'k-1' }),
      ).rejects.toBeInstanceOf(McifyAuthError);
    });

    it('uses verify callback when provided', async () => {
      const cfg = apiKey({
        headerName: 'X-Api-Key',
        env: 'KEY',
        verify: (k) => k === 'magic',
      });
      const headers = new Headers({ 'x-api-key': 'magic' });
      const state = await resolveAuthFromHeaders(cfg, headers, {});
      expect(state).toMatchObject({ type: 'api_key', key: 'magic' });
    });
  });
});
