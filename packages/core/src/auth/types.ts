import type { OAuthStore } from './oauth/store.js';
import type { AuthorizeDecision } from './oauth-provider.js';

export type AuthConfig =
  | { readonly type: 'none' }
  | {
      readonly type: 'bearer';
      readonly env: string;
      readonly verify?: (token: string) => boolean | Promise<boolean>;
    }
  | {
      readonly type: 'api_key';
      readonly headerName: string;
      readonly env: string;
      readonly verify?: (key: string) => boolean | Promise<boolean>;
    }
  | {
      // Delegated: mcify verifies JWTs issued by an external IdP.
      readonly type: 'oauth';
      readonly provider: string;
      readonly scopes: readonly string[];
      readonly authorizationUrl: string;
      readonly tokenUrl: string;
    }
  | {
      // First-party: mcify IS the OAuth 2.1 authorization server (see `oauthProvider()`).
      readonly type: 'oauth_provider';
      readonly store: OAuthStore;
      readonly authorize: (request: Request) => Promise<AuthorizeDecision> | AuthorizeDecision;
      readonly issuer?: string;
      readonly accessTtlSeconds?: number;
      readonly codeTtlSeconds?: number;
      readonly refreshTtlDays?: number;
      readonly resourceName?: string;
    };
