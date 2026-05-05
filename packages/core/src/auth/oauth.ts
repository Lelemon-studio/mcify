import type { AuthConfig } from './types.js';

export interface OAuthOptions {
  readonly provider: string;
  readonly scopes: readonly string[];
  readonly authorizationUrl: string;
  readonly tokenUrl: string;
}

export function oauth(opts: OAuthOptions): Extract<AuthConfig, { type: 'oauth' }> {
  if (!opts.provider) throw new TypeError('oauth: `provider` is required');
  if (!opts.authorizationUrl) throw new TypeError('oauth: `authorizationUrl` is required');
  if (!opts.tokenUrl) throw new TypeError('oauth: `tokenUrl` is required');
  return {
    type: 'oauth',
    provider: opts.provider,
    scopes: opts.scopes,
    authorizationUrl: opts.authorizationUrl,
    tokenUrl: opts.tokenUrl,
  };
}
