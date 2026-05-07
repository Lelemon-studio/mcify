/**
 * Multi-tenant session store for the Fintoc connector.
 *
 * The pattern: a single mcify deploy serves many Fintoc-using businesses
 * ("orgs"). Each org has its own Fintoc `secret_key` (issued by Fintoc to
 * that business). Each org's agent talks to mcify with its own bearer
 * token (issued by you when onboarding the org).
 *
 *   bearer token  →  org id  →  Fintoc secret_key
 *                            →  per-user link_tokens (one per end-user
 *                               bank connection)
 *
 * Why two credentials: Fintoc's auth model has an organisation-level
 * `secret_key` that authorises the API call, and per-end-user
 * `link_token`s — one for each bank account connection that an end-user
 * created via the Fintoc Widget. The agent identifies which end-user it's
 * acting on behalf of through a stable, opaque `userKey` (we never let
 * the LLM see or pick the link_token itself).
 *
 * Implementations:
 *
 *   - {@link MemoryFintocSessionStore}   — in-process Map. Tests + dev.
 *   - {@link JsonFileFintocSessionStore} — disk-backed JSON. Single-host
 *     deploys (Fly volume, Railway disk, anything with a writable FS).
 *
 * For production at scale, implement {@link FintocSessionStore} against
 * your DB (Postgres, Cloudflare D1, KV) and inject it the same way.
 *
 * Security: the resolved {@link FintocSession} carries the upstream
 * Fintoc credentials. Don't expose them to handlers' `ctx.auth.claims` —
 * handlers call `store.resolveBearer(ctx.auth.token)` themselves so the
 * secrets never travel through the request envelope.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { HandlerContext } from '@mcify/core';

export interface FintocSession {
  /** Stable identifier for the Fintoc-using business. Free-form slug. */
  orgId: string;
  /**
   * The org-level `secret_key` (sk_live_... / sk_test_...) issued by
   * Fintoc. Sent in the `Authorization` header (literal — no `Bearer`
   * prefix) on every Fintoc API call this org makes.
   */
  secretKey: string;
  /**
   * Per-end-user `link_token`s, keyed by an opaque, stable `userKey`
   * the operator chooses (RUT, internal user id, anything). The agent
   * passes `userKey` as input; the connector resolves it server-side
   * to the actual `link_token`.
   */
  linkTokens: Record<string, string>;
  /**
   * Optional pin for the `Fintoc-Version` header. Use this to lock an
   * org to a specific API version. Falls back to the client default.
   */
  fintocVersion?: string;
  /** When the bearer token was provisioned. ISO 8601. */
  createdAt?: string;
  /** When the bearer token was revoked (`null` / undefined while active). */
  revokedAt?: string | null;
}

export interface FintocSessionStore {
  /**
   * Look up a session by its bearer token. Returns `null` when the
   * token is unknown or revoked. Called once per request inside the
   * `auth.bearer({ verify })` callback.
   */
  resolveBearer(bearerToken: string): Promise<FintocSession | null>;
}

export interface FintocAdminStore extends FintocSessionStore {
  /** Provision a new bearer → org binding. Used by the admin tooling. */
  add(
    bearerToken: string,
    session: Omit<FintocSession, 'createdAt' | 'linkTokens'> & {
      linkTokens?: Record<string, string>;
    },
  ): Promise<void>;
  /** Mark a bearer as revoked. Idempotent. */
  revoke(bearerToken: string): Promise<void>;
  /**
   * Bind an end-user's `link_token` to this org under the given
   * `userKey`. Overwrites silently if the userKey already exists.
   */
  addLink(bearerToken: string, userKey: string, linkToken: string): Promise<void>;
  /** Remove a single end-user link binding. Idempotent. */
  revokeLink(bearerToken: string, userKey: string): Promise<void>;
  /** List orgIds known to this store (admin / debugging). */
  list(): Promise<
    {
      orgId: string;
      userKeys: string[];
      createdAt?: string;
      revokedAt?: string | null;
    }[]
  >;
}

// ---------------------------------------------------------------------
// MemoryFintocSessionStore
// ---------------------------------------------------------------------

/**
 * In-memory session store. Use for unit tests and local dev only — every
 * restart wipes the table, so don't ship with this in production.
 */
export class MemoryFintocSessionStore implements FintocAdminStore {
  private readonly map = new Map<string, FintocSession>();

  async resolveBearer(bearerToken: string): Promise<FintocSession | null> {
    const session = this.map.get(bearerToken);
    if (!session || session.revokedAt) return null;
    return { ...session, linkTokens: { ...session.linkTokens } };
  }

  async add(
    bearerToken: string,
    session: Omit<FintocSession, 'createdAt' | 'linkTokens'> & {
      linkTokens?: Record<string, string>;
    },
  ): Promise<void> {
    this.map.set(bearerToken, {
      ...session,
      linkTokens: { ...(session.linkTokens ?? {}) },
      createdAt: new Date().toISOString(),
      revokedAt: session.revokedAt ?? null,
    });
  }

  async revoke(bearerToken: string): Promise<void> {
    const existing = this.map.get(bearerToken);
    if (!existing) return;
    this.map.set(bearerToken, { ...existing, revokedAt: new Date().toISOString() });
  }

  async addLink(bearerToken: string, userKey: string, linkToken: string): Promise<void> {
    const existing = this.map.get(bearerToken);
    if (!existing) {
      throw new Error(`Unknown bearer token: cannot add link for org (run \`add\` first).`);
    }
    this.map.set(bearerToken, {
      ...existing,
      linkTokens: { ...existing.linkTokens, [userKey]: linkToken },
    });
  }

  async revokeLink(bearerToken: string, userKey: string): Promise<void> {
    const existing = this.map.get(bearerToken);
    if (!existing) return;
    if (!(userKey in existing.linkTokens)) return;
    const { [userKey]: _, ...rest } = existing.linkTokens;
    this.map.set(bearerToken, { ...existing, linkTokens: rest });
  }

  async list(): Promise<
    { orgId: string; userKeys: string[]; createdAt?: string; revokedAt?: string | null }[]
  > {
    return [...this.map.values()].map((s) => ({
      orgId: s.orgId,
      userKeys: Object.keys(s.linkTokens),
      ...(s.createdAt ? { createdAt: s.createdAt } : {}),
      ...(s.revokedAt !== undefined ? { revokedAt: s.revokedAt } : {}),
    }));
  }
}

// ---------------------------------------------------------------------
// JsonFileFintocSessionStore
// ---------------------------------------------------------------------

interface FileShape {
  // bearer token → session
  sessions: Record<string, FintocSession>;
}

/**
 * JSON-file-backed session store. Suitable for single-host deploys with
 * a writable filesystem (Fly volumes, Railway disks, a self-hosted box).
 *
 * Concurrency: writes are atomic (`tmp + rename`), so a single host with
 * one process is safe. For multi-process / multi-host setups, implement
 * {@link FintocSessionStore} against a real database instead.
 */
export class JsonFileFintocSessionStore implements FintocAdminStore {
  constructor(public readonly filePath: string) {}

  async resolveBearer(bearerToken: string): Promise<FintocSession | null> {
    const data = await this.read();
    const session = data.sessions[bearerToken];
    if (!session || session.revokedAt) return null;
    return session;
  }

  async add(
    bearerToken: string,
    session: Omit<FintocSession, 'createdAt' | 'linkTokens'> & {
      linkTokens?: Record<string, string>;
    },
  ): Promise<void> {
    const data = await this.read();
    data.sessions[bearerToken] = {
      ...session,
      linkTokens: { ...(session.linkTokens ?? {}) },
      createdAt: new Date().toISOString(),
      revokedAt: session.revokedAt ?? null,
    };
    await this.write(data);
  }

  async revoke(bearerToken: string): Promise<void> {
    const data = await this.read();
    const existing = data.sessions[bearerToken];
    if (!existing) return;
    data.sessions[bearerToken] = { ...existing, revokedAt: new Date().toISOString() };
    await this.write(data);
  }

  async addLink(bearerToken: string, userKey: string, linkToken: string): Promise<void> {
    const data = await this.read();
    const existing = data.sessions[bearerToken];
    if (!existing) {
      throw new Error(`Unknown bearer token: cannot add link for org (run \`add\` first).`);
    }
    data.sessions[bearerToken] = {
      ...existing,
      linkTokens: { ...existing.linkTokens, [userKey]: linkToken },
    };
    await this.write(data);
  }

  async revokeLink(bearerToken: string, userKey: string): Promise<void> {
    const data = await this.read();
    const existing = data.sessions[bearerToken];
    if (!existing) return;
    if (!(userKey in existing.linkTokens)) return;
    const { [userKey]: _, ...rest } = existing.linkTokens;
    data.sessions[bearerToken] = { ...existing, linkTokens: rest };
    await this.write(data);
  }

  async list(): Promise<
    { orgId: string; userKeys: string[]; createdAt?: string; revokedAt?: string | null }[]
  > {
    const data = await this.read();
    return Object.values(data.sessions).map((s) => ({
      orgId: s.orgId,
      userKeys: Object.keys(s.linkTokens),
      ...(s.createdAt ? { createdAt: s.createdAt } : {}),
      ...(s.revokedAt !== undefined ? { revokedAt: s.revokedAt } : {}),
    }));
  }

  private async read(): Promise<FileShape> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as FileShape;
      if (!parsed.sessions || typeof parsed.sessions !== 'object') {
        return { sessions: {} };
      }
      return parsed;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        return { sessions: {} };
      }
      throw e;
    }
  }

  private async write(data: FileShape): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${this.filePath}.tmp.${process.pid}.${Date.now()}`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tmp, this.filePath);
  }
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

/**
 * Narrow `ctx.auth` from `AuthState` (a discriminated union) down to a
 * Fintoc session. Throws when the request didn't authenticate as bearer
 * or when the bearer is unknown / revoked.
 *
 * Use this at the top of every tool handler:
 *
 *   handler: async (input, ctx) => {
 *     const session = await sessionFromContext(sessions, ctx);
 *     const linkToken = getLinkToken(session, input.userKey);
 *     const client = new FintocClient({ secretKey: session.secretKey });
 *     ...
 *   }
 */
export const sessionFromContext = async (
  store: FintocSessionStore,
  ctx: HandlerContext,
): Promise<FintocSession> => {
  if (ctx.auth.type !== 'bearer') {
    throw new Error('Fintoc tools require bearer authentication.');
  }
  const session = await store.resolveBearer(ctx.auth.token);
  if (!session) {
    throw new Error('Unknown bearer token (session expired or revoked).');
  }
  return session;
};

/**
 * Resolve the `link_token` for a given `userKey` within a session.
 * Throws a descriptive error when the userKey isn't bound — surfaces
 * a clear failure to the agent instead of a silent 401 from Fintoc.
 */
export const getLinkToken = (session: FintocSession, userKey: string): string => {
  const linkToken = session.linkTokens[userKey];
  if (!linkToken) {
    throw new Error(
      `No Fintoc link bound for userKey "${userKey}" in org "${session.orgId}". ` +
        `Use the admin CLI (\`add-link\`) to bind one before calling this tool.`,
    );
  }
  return linkToken;
};
