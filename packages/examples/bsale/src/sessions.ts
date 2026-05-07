/**
 * Multi-tenant session store for the Bsale connector.
 *
 * The pattern: a single mcify deploy serves many Bsale-using businesses
 * ("orgs"). Each org has its own Bsale `access_token` (issued by Bsale to
 * that business). Each org's agent talks to mcify with its own bearer
 * token (issued by you when onboarding the org).
 *
 *   bearer token  →  org id  →  Bsale access_token
 *
 * This module is the lookup table. Implementations:
 *
 *   - {@link MemoryBsaleSessionStore}   — in-process Map. Tests + dev.
 *   - {@link JsonFileBsaleSessionStore} — disk-backed JSON. Single-host
 *     deploys (Fly volume, Railway disk, anything with a writable FS).
 *
 * For production at scale, implement {@link BsaleSessionStore} against
 * your DB (Postgres, Cloudflare D1, KV) and inject it the same way.
 *
 * Security: the resolved {@link BsaleSession} carries the upstream
 * Bsale token. Don't expose it to handlers' `ctx.auth.claims` — handlers
 * call `store.resolveBearer(ctx.auth.token)` themselves so the secret
 * never travels through the request envelope and we keep one less attack
 * surface.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { HandlerContext } from '@mcify/core';

export interface BsaleSession {
  /** Stable identifier for the Bsale-using business. Free-form slug. */
  orgId: string;
  /**
   * The `access_token` issued by Bsale to this business. Sent in the
   * `access_token` header on every Bsale API call this org makes.
   */
  bsaleAccessToken: string;
  /** When the bearer token was provisioned. ISO 8601. */
  createdAt?: string;
  /** When the bearer token was revoked (`null` / undefined while active). */
  revokedAt?: string | null;
}

export interface BsaleSessionStore {
  /**
   * Look up a session by its bearer token. Returns `null` when the
   * token is unknown or revoked. Called once per request inside the
   * `auth.bearer({ verify })` callback.
   */
  resolveBearer(bearerToken: string): Promise<BsaleSession | null>;
}

export interface BsaleAdminStore extends BsaleSessionStore {
  /** Provision a new bearer → org binding. Used by the admin tooling. */
  add(bearerToken: string, session: Omit<BsaleSession, 'createdAt'>): Promise<void>;
  /** Mark a bearer as revoked. Idempotent. */
  revoke(bearerToken: string): Promise<void>;
  /** List orgIds known to this store (admin / debugging). */
  list(): Promise<{ orgId: string; createdAt?: string; revokedAt?: string | null }[]>;
}

// ---------------------------------------------------------------------
// MemoryBsaleSessionStore
// ---------------------------------------------------------------------

/**
 * In-memory session store. Use for unit tests and local dev only — every
 * restart wipes the table, so don't ship with this in production.
 */
export class MemoryBsaleSessionStore implements BsaleAdminStore {
  private readonly map = new Map<string, BsaleSession>();

  async resolveBearer(bearerToken: string): Promise<BsaleSession | null> {
    const session = this.map.get(bearerToken);
    if (!session || session.revokedAt) return null;
    return { ...session };
  }

  async add(bearerToken: string, session: Omit<BsaleSession, 'createdAt'>): Promise<void> {
    this.map.set(bearerToken, {
      ...session,
      createdAt: new Date().toISOString(),
      revokedAt: session.revokedAt ?? null,
    });
  }

  async revoke(bearerToken: string): Promise<void> {
    const existing = this.map.get(bearerToken);
    if (!existing) return;
    this.map.set(bearerToken, { ...existing, revokedAt: new Date().toISOString() });
  }

  async list(): Promise<{ orgId: string; createdAt?: string; revokedAt?: string | null }[]> {
    return [...this.map.values()].map((s) => ({
      orgId: s.orgId,
      ...(s.createdAt ? { createdAt: s.createdAt } : {}),
      ...(s.revokedAt !== undefined ? { revokedAt: s.revokedAt } : {}),
    }));
  }
}

// ---------------------------------------------------------------------
// JsonFileBsaleSessionStore
// ---------------------------------------------------------------------

interface FileShape {
  // bearer token → session
  sessions: Record<string, BsaleSession>;
}

/**
 * JSON-file-backed session store. Suitable for single-host deploys with
 * a writable filesystem (Fly volumes, Railway disks, a self-hosted box).
 *
 * Concurrency: writes are atomic (`tmp + rename`), so a single host with
 * one process is safe. For multi-process / multi-host setups, implement
 * {@link BsaleSessionStore} against a real database instead.
 */
export class JsonFileBsaleSessionStore implements BsaleAdminStore {
  constructor(public readonly filePath: string) {}

  async resolveBearer(bearerToken: string): Promise<BsaleSession | null> {
    const data = await this.read();
    const session = data.sessions[bearerToken];
    if (!session || session.revokedAt) return null;
    return session;
  }

  async add(bearerToken: string, session: Omit<BsaleSession, 'createdAt'>): Promise<void> {
    const data = await this.read();
    data.sessions[bearerToken] = {
      ...session,
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

  async list(): Promise<{ orgId: string; createdAt?: string; revokedAt?: string | null }[]> {
    const data = await this.read();
    return Object.values(data.sessions).map((s) => ({
      orgId: s.orgId,
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
    // Atomic-ish write: write to a tmp file and rename. Survives a crash
    // mid-write (the original file stays valid).
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
 * Bsale session. Throws when the request didn't authenticate as bearer
 * or when the bearer is unknown / revoked.
 *
 * Use this at the top of every tool handler:
 *
 *   handler: async (input, ctx) => {
 *     const session = await sessionFromContext(sessions, ctx);
 *     const client = new BsaleClient({ accessToken: session.bsaleAccessToken });
 *     ...
 *   }
 */
export const sessionFromContext = async (
  store: BsaleSessionStore,
  ctx: HandlerContext,
): Promise<BsaleSession> => {
  if (ctx.auth.type !== 'bearer') {
    throw new Error('Bsale tools require bearer authentication.');
  }
  const session = await store.resolveBearer(ctx.auth.token);
  if (!session) {
    throw new Error('Unknown bearer token (session expired or revoked).');
  }
  return session;
};
