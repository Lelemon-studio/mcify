/**
 * Multi-tenant session store for the Mercado Pago connector.
 *
 * Pattern: a single mcify deploy serves many merchants ("orgs"). Each
 * org has its own MP **access token** (issued from
 * https://www.mercadopago.cl/developers → Tus integraciones).
 *
 *   bearer token  →  org id  →  MP access_token + environment
 *
 * Mercado Pago, like Khipu, separates test/sandbox credentials from
 * production. Test tokens start with `TEST-` and live tokens start with
 * `APP_USR-` (or similar). The session declares which one this org
 * uses, so test and prod orgs co-exist on the same deploy.
 *
 * Implementations:
 *   - {@link MemoryMercadoPagoSessionStore}   — in-process Map.
 *   - {@link JsonFileMercadoPagoSessionStore} — disk-backed JSON.
 *
 * Security: the resolved {@link MercadoPagoSession} carries the
 * upstream MP access token. Don't expose it in `ctx.auth.claims` —
 * handlers fetch it from the store using the bearer.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { HandlerContext } from '@mcify/core';

export type MercadoPagoEnvironment = 'sandbox' | 'production';

export interface MercadoPagoSession {
  /** Stable identifier for the merchant. Free-form slug. */
  orgId: string;
  /**
   * MP access token from the merchant's integration. Test tokens start
   * with `TEST-`, live tokens with `APP_USR-`.
   */
  accessToken: string;
  /**
   * Which MP environment this org operates against. `sandbox` uses the
   * MP test scope; `production` uses real money.
   */
  environment: MercadoPagoEnvironment;
  createdAt?: string;
  revokedAt?: string | null;
}

export interface MercadoPagoSessionStore {
  resolveBearer(bearerToken: string): Promise<MercadoPagoSession | null>;
}

export interface MercadoPagoAdminStore extends MercadoPagoSessionStore {
  add(bearerToken: string, session: Omit<MercadoPagoSession, 'createdAt'>): Promise<void>;
  revoke(bearerToken: string): Promise<void>;
  list(): Promise<
    {
      orgId: string;
      environment: MercadoPagoEnvironment;
      createdAt?: string;
      revokedAt?: string | null;
    }[]
  >;
}

// ---------------------------------------------------------------------
// MemoryMercadoPagoSessionStore
// ---------------------------------------------------------------------

export class MemoryMercadoPagoSessionStore implements MercadoPagoAdminStore {
  private readonly map = new Map<string, MercadoPagoSession>();

  async resolveBearer(bearerToken: string): Promise<MercadoPagoSession | null> {
    const session = this.map.get(bearerToken);
    if (!session || session.revokedAt) return null;
    return { ...session };
  }

  async add(bearerToken: string, session: Omit<MercadoPagoSession, 'createdAt'>): Promise<void> {
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
      environment: MercadoPagoEnvironment;
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
// JsonFileMercadoPagoSessionStore
// ---------------------------------------------------------------------

interface FileShape {
  sessions: Record<string, MercadoPagoSession>;
}

export class JsonFileMercadoPagoSessionStore implements MercadoPagoAdminStore {
  constructor(public readonly filePath: string) {}

  async resolveBearer(bearerToken: string): Promise<MercadoPagoSession | null> {
    const data = await this.read();
    const session = data.sessions[bearerToken];
    if (!session || session.revokedAt) return null;
    return session;
  }

  async add(bearerToken: string, session: Omit<MercadoPagoSession, 'createdAt'>): Promise<void> {
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
      environment: MercadoPagoEnvironment;
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

export const sessionFromContext = async (
  store: MercadoPagoSessionStore,
  ctx: HandlerContext,
): Promise<MercadoPagoSession> => {
  if (ctx.auth.type !== 'bearer') {
    throw new Error('Mercado Pago tools require bearer authentication.');
  }
  const session = await store.resolveBearer(ctx.auth.token);
  if (!session) {
    throw new Error('Unknown bearer token (session expired or revoked).');
  }
  return session;
};
