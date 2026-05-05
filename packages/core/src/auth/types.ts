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
      readonly type: 'oauth';
      readonly provider: string;
      readonly scopes: readonly string[];
      readonly authorizationUrl: string;
      readonly tokenUrl: string;
    };
