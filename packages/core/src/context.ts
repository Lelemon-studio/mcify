export type LogMeta = Record<string, unknown>;

export interface Logger {
  trace(msg: string, meta?: LogMeta): void;
  debug(msg: string, meta?: LogMeta): void;
  info(msg: string, meta?: LogMeta): void;
  warn(msg: string, meta?: LogMeta): void;
  error(msg: string, meta?: LogMeta): void;
  child(bindings: LogMeta): Logger;
}

export type AuthState =
  | { readonly type: 'none' }
  | { readonly type: 'bearer'; readonly token: string }
  | { readonly type: 'api_key'; readonly key: string; readonly headerName: string }
  | { readonly type: 'oauth'; readonly token: string; readonly scopes: readonly string[] }
  | {
      // Issued by mcify's own authorization server (`oauthProvider()`). `subject` is the opaque
      // host identity bound to the token (e.g. Lelemon's `{ userId, projectId }`).
      readonly type: 'oauth_provider';
      readonly subject: Record<string, string>;
      readonly clientId: string;
      readonly scope: string | null;
    };

export interface RequestMeta {
  readonly id: string;
  readonly receivedAt: Date;
}

export interface HandlerContext {
  readonly logger: Logger;
  readonly fetch: typeof fetch;
  readonly auth: AuthState;
  readonly signal: AbortSignal;
  readonly request: RequestMeta;
}
