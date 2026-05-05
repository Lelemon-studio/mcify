import { describe, it, expect } from 'vitest';
import { bearer } from './bearer.js';
import { apiKey } from './api-key.js';
import { oauth } from './oauth.js';
import { none } from './none.js';

describe('auth helpers', () => {
  describe('bearer', () => {
    it('returns a bearer config with env name', () => {
      const cfg = bearer({ env: 'API_TOKEN' });
      expect(cfg).toEqual({ type: 'bearer', env: 'API_TOKEN', verify: undefined });
    });

    it('passes through a verify callback', async () => {
      const verify = (token: string) => token === 'ok';
      const cfg = bearer({ env: 'API_TOKEN', verify });
      expect(cfg.verify).toBe(verify);
    });

    it('throws when env is missing', () => {
      // @ts-expect-error missing required field
      expect(() => bearer({})).toThrow(/env/);
    });
  });

  describe('apiKey', () => {
    it('returns an api_key config', () => {
      const cfg = apiKey({ headerName: 'X-Api-Key', env: 'KEY' });
      expect(cfg).toEqual({
        type: 'api_key',
        headerName: 'X-Api-Key',
        env: 'KEY',
        verify: undefined,
      });
    });

    it('throws when headerName is missing', () => {
      // @ts-expect-error missing required field
      expect(() => apiKey({ env: 'KEY' })).toThrow(/headerName/);
    });

    it('throws when env is missing', () => {
      // @ts-expect-error missing required field
      expect(() => apiKey({ headerName: 'X-Api-Key' })).toThrow(/env/);
    });
  });

  describe('oauth', () => {
    it('returns an oauth config', () => {
      const cfg = oauth({
        provider: 'google',
        scopes: ['email'],
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
      });
      expect(cfg.type).toBe('oauth');
      expect(cfg.provider).toBe('google');
      expect(cfg.scopes).toEqual(['email']);
    });

    it('throws when provider is missing', () => {
      expect(() =>
        oauth({
          provider: '',
          scopes: [],
          authorizationUrl: 'a',
          tokenUrl: 'b',
        }),
      ).toThrow(/provider/);
    });
  });

  describe('none', () => {
    it('returns a none config', () => {
      expect(none()).toEqual({ type: 'none' });
    });
  });
});
