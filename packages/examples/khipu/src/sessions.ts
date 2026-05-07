/**
 * Multi-tenant session store for the Khipu connector.
 *
 * Pattern: a single mcify deploy serves many merchants ("orgs"). Each
 * org has its own Khipu API key (issued from their merchant dashboard).
 * Each org's agent talks to mcify with its own bearer token (provisioned
 * by the operator at onboarding).
 *
 *   bearer token  →  org id  →  Khipu API key
 *                            +  environment ('dev' | 'live')
 *
 * Khipu separates development and production credentials explicitly —
 * each session declares which environment it operates against, so the
 * same deploy can host orgs in different stages without redeploys.
 *
 * Implementations:
 *   - {@link MemoryKhipuSessionStore}   — in-process Map. Tests + dev.
 *   - {@link JsonFileKhipuSessionStore} — disk-backed JSON. Single-host
 *     deploys with a writable filesystem.
 *
 * For production at scale, implement {@link KhipuSessionStore} against
 * a DB (Postgres, D1, KV) and inject it the same way.
 *
 * Security: the resolved {@link KhipuSession} carries the upstream
 * Khipu API key. Don't expose it to handlers' `ctx.auth.claims` —
 * handlers call `store.resolveBearer(ctx.auth.token)` themselves so
 * the secret never travels through the request envelope and we keep
 * one less attack surface.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { HandlerContext } from '@mcify/core';

export type KhipuEnvironment = 'dev' | 'live';

export interface KhipuSession {
  /** Stable identifier for the merchant. Free-form slug. */
  orgId: string;
  /** API key from the merchant's Khipu collection account. */
  apiKey: string;
  /**
   * Which Khipu environment this org operates against. `dev` uses
   * development credentials (no real money moves); `live` uses
   * production credentials (real bank transfers).
   */
  environment: KhipuEnvironment;
  /** When the bearer was provisioned. ISO 8601. */
  createdAt?: string;
  /** When the bearer was revoked (`null` / undefined while active). */
  revokedAt?: string | null;
}

export interface KhipuSessionStore {
  /**
   * Look up a session by its bearer token. Returns `null` when the
   * token is unknown or revoked. Called once per request inside the
   * `auth.bearer({ verify })` callback.
   */
  resolveBearer(bearerToken: string): Promise<KhipuSession | null>;
}

export interface KhipuAdminStore extends KhipuSessionStore {
  add(bearerToken: string, session: Omit<KhipuSession, 'createdAt'>): Promise<void>;
  revoke(bearerToken: string): Promise<void>;
  list(): Promise<
    {
      orgId: string;
      environment: KhipuEnvironment;
      createdAt?: string;
      revokedAt?: string | null;
    }[]
  >;
}

// ---------------------------------------------------------------------
// MemoryKhipuSessionStore
// ---------------------------------------------------------------------

export class MemoryKhipuSessionStore implements KhipuAdminStore {
  private readonly map = new Map<string, KhipuSession>();

  async resolveBearer(bearerToken: string): Promise<KhipuSession | null> {
    const session = this.map.get(bearerToken);
    if (!session || session.revokedAt) return null;
    return { ...session };
  }

  async add(bearerToken: string, session: Omit<KhipuSession, 'createdAt'>): Promise<void> {
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

  async list(): Promise<
    {
      orgId: string;
      environment: KhipuEnvironment;
      createdAt?: string;
      revokedAt?: string | null;
    }[]
  > {
    return [...this.map.values()].map((s) => ({
      orgId: s.orgId,
      environment: s.environment,
      ...(s.createdAt ? { createdAt: s.createdAt } : {}),
      ...(s.revokedAt !== undefined ? { revokedAt: s.revokedAt } : {}),
    }));
  }
}

// ---------------------------------------------------------------------
// JsonFileKhipuSessionStore
// ---------------------------------------------------------------------

interface FileShape {
  sessions: Record<string, KhipuSession>;
}

export class JsonFileKhipuSessionStore implements KhipuAdminStore {
  constructor(public readonly filePath: string) {}

  async resolveBearer(bearerToken: string): Promise<KhipuSession | null> {
    const data = await this.read();
    const session = data.sessions[bearerToken];
    if (!session || session.revokedAt) return null;
    return session;
  }

  async add(bearerToken: string, session: Omit<KhipuSession, 'createdAt'>): Promise<void> {
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

  async list(): Promise<
    {
      orgId: string;
      environment: KhipuEnvironment;
      createdAt?: string;
      revokedAt?: string | null;
    }[]
  > {
    const data = await this.read();
    return Object.values(data.sessions).map((s) => ({
      orgId: s.orgId,
      environment: s.environment,
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
 * Khipu session. Throws when the request didn't authenticate as bearer
 * or when the bearer is unknown / revoked.
 */
export const sessionFromContext = async (
  store: KhipuSessionStore,
  ctx: HandlerContext,
): Promise<KhipuSession> => {
  if (ctx.auth.type !== 'bearer') {
    throw new Error('Khipu tools require bearer authentication.');
  }
  const session = await store.resolveBearer(ctx.auth.token);
  if (!session) {
    throw new Error('Unknown bearer token (session expired or revoked).');
  }
  return session;
};
