import type { AuthConfig } from './types.js';

export interface ApiKeyOptions {
  readonly headerName: string;
  readonly env: string;
  readonly verify?: (key: string) => boolean | Promise<boolean>;
}

export function apiKey(opts: ApiKeyOptions): Extract<AuthConfig, { type: 'api_key' }> {
  if (!opts.headerName) {
    throw new TypeError('apiKey: `headerName` is required');
  }
  if (!opts.env) {
    throw new TypeError('apiKey: `env` is required (env var name holding the key)');
  }
  return {
    type: 'api_key',
    headerName: opts.headerName,
    env: opts.env,
    verify: opts.verify,
  };
}
