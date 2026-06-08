/**
 * Persistence contract for the OAuth 2.1 authorization server. The host plugs in its own
 * implementation (Postgres, KV, D1, …); {@link MemoryOAuthStore} ships for dev and tests.
 *
 * Mirrors the four hashed tables of the reference implementation (clients, authorization codes,
 * access tokens, refresh tokens). Tokens and codes are stored **hashed (SHA-256)** — the store
 * only ever sees `*Hash` values, never the plaintext.
 *
 * ## Atomicity contract (security-critical)
 * `consumeAuthorizationCode` and `consumeRefreshToken` MUST be atomic single-use operations: a
 * real adapter implements them as a conditional update
 * (`… SET consumed_at = now() WHERE …Hash = ? AND consumed_at IS NULL RETURNING *`) and reports
 * whether **this** call won the race. Without that, two concurrent redemptions both succeed —
 * which defeats single-use codes and refresh-rotation theft detection.
 *
 * ## Subject
 * The authenticated principal is opaque to mcify: a `Record<string, string>` the host supplies
 * (e.g. Lelemon's `{ userId, projectId }`). It is persisted as its canonical string form
 * (`subjectKey`) so rows can be grouped/revoked without mcify understanding the domain.
 */

export interface NewClient {
  readonly clientId: string;
  readonly clientName: string | null;
  readonly redirectUris: readonly string[];
  readonly grantTypes: readonly string[];
  readonly tokenEndpointAuthMethod: string;
  readonly scope: string | null;
}

export interface StoredClient extends NewClient {
  readonly createdAt: Date;
}

export interface NewAuthCode {
  readonly codeHash: string;
  readonly clientId: string;
  readonly subjectKey: string;
  readonly redirectUri: string;
  readonly codeChallenge: string;
  readonly codeChallengeMethod: string;
  readonly scope: string | null;
  readonly expiresAt: Date;
}

export interface StoredAuthCode {
  readonly clientId: string;
  readonly subjectKey: string;
  readonly redirectUri: string;
  readonly codeChallenge: string;
  readonly codeChallengeMethod: string;
  readonly scope: string | null;
  readonly expiresAt: Date;
}

export interface NewAccessToken {
  readonly tokenHash: string;
  readonly clientId: string;
  readonly subjectKey: string;
  readonly scope: string | null;
  readonly expiresAt: Date;
}

export interface StoredAccessToken {
  readonly clientId: string;
  readonly subjectKey: string;
  readonly scope: string | null;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

export interface NewRefreshToken {
  readonly tokenHash: string;
  readonly clientId: string;
  readonly subjectKey: string;
  readonly scope: string | null;
  readonly expiresAt: Date;
}

export interface StoredRefreshToken {
  readonly id: string;
  readonly clientId: string;
  readonly subjectKey: string;
  readonly scope: string | null;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
}

export interface OAuthStore {
  // ── Clients (Dynamic Client Registration) ────────────────────────────────
  insertClient(client: NewClient): Promise<StoredClient>;
  getClientById(clientId: string): Promise<StoredClient | null>;
  /** Clients with the given `client_name` (or null) — used for idempotent DCR dedup. */
  findClientsByName(clientName: string | null): Promise<StoredClient[]>;

  // ── Authorization codes ───────────────────────────────────────────────────
  insertAuthorizationCode(code: NewAuthCode): Promise<void>;
  /** ATOMIC single-use: returns the row only if this call consumed it; null otherwise. */
  consumeAuthorizationCode(codeHash: string): Promise<StoredAuthCode | null>;

  // ── Access tokens ─────────────────────────────────────────────────────────
  insertAccessToken(token: NewAccessToken): Promise<void>;
  getAccessTokenByHash(tokenHash: string): Promise<StoredAccessToken | null>;

  // ── Refresh tokens (rotation + theft detection) ───────────────────────────
  insertRefreshToken(token: NewRefreshToken): Promise<StoredRefreshToken>;
  getRefreshTokenByHash(tokenHash: string): Promise<StoredRefreshToken | null>;
  /** ATOMIC: flips consumed_at NULL→now for this id. `true` only if this call won the race. */
  consumeRefreshToken(id: string): Promise<boolean>;
  /** Audit link from a consumed refresh to its successor (best-effort). */
  setRefreshRotatedTo(id: string, rotatedToId: string): Promise<void>;
  /** Theft response: revoke every access + refresh token for this subject + client. */
  revokeChain(subjectKey: string, clientId: string): Promise<void>;
}
