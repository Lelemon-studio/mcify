import type {
  NewAccessToken,
  NewAuthCode,
  NewClient,
  NewRefreshToken,
  OAuthStore,
  StoredAccessToken,
  StoredAuthCode,
  StoredClient,
  StoredRefreshToken,
} from './store.js';

// Internal mutable rows. The public `Stored*` types expose them with readonly fields; here we
// need to flip `consumedAt` / `revokedAt`, so the maps hold mutable records and reads return them
// widened to the readonly shape.
interface CodeRow {
  clientId: string;
  subjectKey: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
}
interface AccessRow {
  clientId: string;
  subjectKey: string;
  scope: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
}
interface RefreshRow {
  id: string;
  tokenHash: string;
  clientId: string;
  subjectKey: string;
  scope: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
}

/**
 * In-memory {@link OAuthStore} for local dev, the inspector, and tests. Not for production
 * (state is lost on restart and not shared across instances) — bring a Postgres/KV adapter there.
 *
 * The atomic `consume*` operations are trivially safe here: JavaScript is single-threaded, so a
 * check-and-set within one synchronous tick cannot interleave. Adapters over a real database must
 * provide the same guarantee with a conditional UPDATE (see {@link OAuthStore}).
 */
export class MemoryOAuthStore implements OAuthStore {
  private readonly clients = new Map<string, StoredClient>();
  private readonly codes = new Map<string, CodeRow>();
  private readonly accessTokens = new Map<string, AccessRow>();
  private readonly refreshTokens = new Map<string, RefreshRow>();
  private seq = 0;

  /** Deterministic clock injection for tests; defaults to `new Date()`. */
  constructor(private readonly now: () => Date = () => new Date()) {}

  async insertClient(client: NewClient): Promise<StoredClient> {
    const stored: StoredClient = { ...client, createdAt: this.now() };
    this.clients.set(client.clientId, stored);
    return stored;
  }

  async getClientById(clientId: string): Promise<StoredClient | null> {
    return this.clients.get(clientId) ?? null;
  }

  async findClientsByName(clientName: string | null): Promise<StoredClient[]> {
    return [...this.clients.values()].filter((c) => c.clientName === clientName);
  }

  async insertAuthorizationCode(code: NewAuthCode): Promise<void> {
    this.codes.set(code.codeHash, {
      clientId: code.clientId,
      subjectKey: code.subjectKey,
      redirectUri: code.redirectUri,
      codeChallenge: code.codeChallenge,
      codeChallengeMethod: code.codeChallengeMethod,
      scope: code.scope,
      expiresAt: code.expiresAt,
      consumedAt: null,
    });
  }

  async consumeAuthorizationCode(codeHash: string): Promise<StoredAuthCode | null> {
    const row = this.codes.get(codeHash);
    if (!row || row.consumedAt) return null; // single-use: already consumed → null
    row.consumedAt = this.now();
    return row;
  }

  async insertAccessToken(token: NewAccessToken): Promise<void> {
    this.accessTokens.set(token.tokenHash, {
      clientId: token.clientId,
      subjectKey: token.subjectKey,
      scope: token.scope,
      expiresAt: token.expiresAt,
      revokedAt: null,
    });
  }

  async getAccessTokenByHash(tokenHash: string): Promise<StoredAccessToken | null> {
    return this.accessTokens.get(tokenHash) ?? null;
  }

  async insertRefreshToken(token: NewRefreshToken): Promise<StoredRefreshToken> {
    const id = `rt_${(this.seq += 1)}`;
    const stored: RefreshRow = {
      id,
      tokenHash: token.tokenHash,
      clientId: token.clientId,
      subjectKey: token.subjectKey,
      scope: token.scope,
      expiresAt: token.expiresAt,
      consumedAt: null,
    };
    this.refreshTokens.set(id, stored);
    return stored;
  }

  async getRefreshTokenByHash(tokenHash: string): Promise<StoredRefreshToken | null> {
    return [...this.refreshTokens.values()].find((t) => t.tokenHash === tokenHash) ?? null;
  }

  async consumeRefreshToken(id: string): Promise<boolean> {
    const row = this.refreshTokens.get(id);
    if (!row || row.consumedAt) return false; // already rotated → caller revokes the chain
    row.consumedAt = this.now();
    return true;
  }

  async setRefreshRotatedTo(_id: string, _rotatedToId: string): Promise<void> {
    // Audit-only link; the memory store does not need to persist it.
  }

  async revokeChain(subjectKey: string, clientId: string): Promise<void> {
    const at = this.now();
    for (const token of this.accessTokens.values()) {
      if (token.subjectKey === subjectKey && token.clientId === clientId && !token.revokedAt) {
        token.revokedAt = at;
      }
    }
    for (const token of this.refreshTokens.values()) {
      if (token.subjectKey === subjectKey && token.clientId === clientId && !token.consumedAt) {
        token.consumedAt = at;
      }
    }
  }
}
