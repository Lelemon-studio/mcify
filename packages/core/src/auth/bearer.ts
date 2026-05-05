import type { AuthConfig } from './types.js';

export interface BearerOptions {
  readonly env: string;
  readonly verify?: (token: string) => boolean | Promise<boolean>;
}

export function bearer(opts: BearerOptions): Extract<AuthConfig, { type: 'bearer' }> {
  if (!opts.env) {
    throw new TypeError('bearer: `env` is required (env var name holding the token)');
  }
  return {
    type: 'bearer',
    env: opts.env,
    verify: opts.verify,
  };
}
