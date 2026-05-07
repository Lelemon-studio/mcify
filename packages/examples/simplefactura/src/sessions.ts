/**
 * Multi-tenant session store for the SimpleFactura connector.
 *
 * SimpleFactura's auth model has a useful quirk: a single user account
 * (email + password) can operate **many companies**. Each business
 * endpoint receives a `Credenciales` object that names which company
 * to act on (`rutEmisor`, `rutContribuyente`, `nombreSucursal`).
 *
 * This means one bearer (org) can host many "empresas" in the store —
 * a perfect fit for the accountant-PyME case (one accountant manages
 * 10 small businesses, each addressed via a stable `userKey`).
 *
 *   bearer token  →  org id  →  SimpleFactura email + password
 *                            →  cached JWT (auto-refreshed)
 *                            →  empresas: { userKey → Credenciales }
 *
 * Implementations:
 *
 *   - {@link MemorySimpleFacturaSessionStore}   — in-process Map. Tests + dev.
 *   - {@link JsonFileSimpleFacturaSessionStore} — disk-backed JSON. Single-host
 *     deploys (Fly volume, Railway disk, anything with a writable FS).
 *
 * For production at scale, implement {@link SimpleFacturaSessionStore}
 * against a DB (Postgres, D1, KV) and inject it the same way.
 *
 * Security: the resolved {@link SimpleFacturaSession} carries upstream
 * credentials (email + password + cached JWT). Don't expose them to
 * `ctx.auth.claims` — handlers call `store.resolveBearer(ctx.auth.token)`
 * themselves so the secret never travels through the request envelope.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { HandlerContext } from '@mcify/core';
import type { SimpleFacturaTokenCache } from './client.js';

/**
 * One company inside a SimpleFactura account. The `userKey` is the
 * stable identifier the agent uses (a RUT, an internal id, anything).
 *
 * Beyond the credentials fields (rutEmisor, rutContribuyente,
 * nombreSucursal), this also holds the **emisor profile** — the static
 * data SimpleFactura needs in every emitted DTE: razón social, giro,
 * ACTECO, direction. The operator sets these once at onboarding via
 * the admin CLI; tools read them when composing a RequestDTE so the
 * LLM never has to know them.
 */
export interface SimpleFacturaEmpresa {
  /** Required — identifies the company on every business endpoint. */
  rutEmisor: string;
  /** Optional — RUT of the contributor user inside the company. */
  rutContribuyente?: string;
  /** Optional — branch office identifier (free-form, set by the merchant). */
  nombreSucursal?: string;
  /** Razón social del emisor (max 70 chars per SII). */
  razonSocial?: string;
  /** Giro tributario (max 80 chars per SII). */
  giro?: string;
  /** Códigos de actividad económica registrados en el SII. */
  acteco?: number[];
  /** Dirección de origen del emisor. */
  direccion?: string;
  /** Comuna de origen. */
  comuna?: string;
  /** Ciudad de origen. */
  ciudad?: string;
  /** Código de sucursal SII (si aplica). */
  cdgSiiSucursal?: number;
}

export interface SimpleFacturaSession {
  /** Stable identifier for the SimpleFactura-using business / operator. */
  orgId: string;
  /** SimpleFactura account email. Used to mint and refresh JWTs. */
  email: string;
  /** SimpleFactura account password. Stored at rest in the session store. */
  password: string;
  /**
   * Empresas keyed by an opaque, stable `userKey`. The agent passes the
   * userKey; the connector resolves it server-side to a `Credenciales`
   * object the SimpleFactura API understands.
   */
  empresas: Record<string, SimpleFacturaEmpresa>;
  /**
   * The userKey to use when a tool call doesn't specify one. Useful when
   * the org has only one company.
   */
  defaultUserKey?: string;
  /** Cached JWT (refreshed lazily by the client + persisted via updateToken). */
  cachedToken?: SimpleFacturaTokenCache;
  /** When the bearer was provisioned. ISO 8601. */
  createdAt?: string;
  /** When the bearer was revoked (`null` / undefined while active). */
  revokedAt?: string | null;
}

export interface SimpleFacturaSessionStore {
  /** Resolve a session by bearer. Returns null when unknown or revoked. */
  resolveBearer(bearerToken: string): Promise<SimpleFacturaSession | null>;
  /**
   * Persist a fresh JWT back to the store after the client refreshes
   * it. Implementations may no-op (e.g. memory) but JsonFile/DB stores
   * should write so the next process startup sees a valid cache.
   */
  updateToken(bearerToken: string, token: SimpleFacturaTokenCache): Promise<void>;
}

export interface SimpleFacturaAdminStore extends SimpleFacturaSessionStore {
  add(
    bearerToken: string,
    session: Omit<SimpleFacturaSession, 'createdAt' | 'empresas'> & {
      empresas?: Record<string, SimpleFacturaEmpresa>;
    },
  ): Promise<void>;
  revoke(bearerToken: string): Promise<void>;
  /**
   * Bind an `empresa` (one company inside the SimpleFactura account)
   * to this org under the given `userKey`. Overwrites silently if the
   * userKey already exists.
   */
  addEmpresa(bearerToken: string, userKey: string, empresa: SimpleFacturaEmpresa): Promise<void>;
  revokeEmpresa(bearerToken: string, userKey: string): Promise<void>;
  /** Set or clear the default empresa for an org. */
  setDefault(bearerToken: string, userKey: string | null): Promise<void>;
  list(): Promise<
    {
      orgId: string;
      empresas: { userKey: string; rutEmisor: string }[];
      defaultUserKey?: string;
      createdAt?: string;
      revokedAt?: string | null;
    }[]
  >;
}

// ---------------------------------------------------------------------
// MemorySimpleFacturaSessionStore
// ---------------------------------------------------------------------

export class MemorySimpleFacturaSessionStore implements SimpleFacturaAdminStore {
  private readonly map = new Map<string, SimpleFacturaSession>();

  async resolveBearer(bearerToken: string): Promise<SimpleFacturaSession | null> {
    const session = this.map.get(bearerToken);
    if (!session || session.revokedAt) return null;
    return cloneSession(session);
  }

  async updateToken(bearerToken: string, token: SimpleFacturaTokenCache): Promise<void> {
    const existing = this.map.get(bearerToken);
    if (!existing) return;
    this.map.set(bearerToken, { ...existing, cachedToken: { ...token } });
  }

  async add(
    bearerToken: string,
    session: Omit<SimpleFacturaSession, 'createdAt' | 'empresas'> & {
      empresas?: Record<string, SimpleFacturaEmpresa>;
    },
  ): Promise<void> {
    this.map.set(bearerToken, {
      ...session,
      empresas: { ...(session.empresas ?? {}) },
      createdAt: new Date().toISOString(),
      revokedAt: session.revokedAt ?? null,
    });
  }

  async revoke(bearerToken: string): Promise<void> {
    const existing = this.map.get(bearerToken);
    if (!existing) return;
    this.map.set(bearerToken, { ...existing, revokedAt: new Date().toISOString() });
  }

  async addEmpresa(
    bearerToken: string,
    userKey: string,
    empresa: SimpleFacturaEmpresa,
  ): Promise<void> {
    const existing = this.map.get(bearerToken);
    if (!existing) {
      throw new Error('Unknown bearer token: cannot add empresa for org (run `add` first).');
    }
    this.map.set(bearerToken, {
      ...existing,
      empresas: { ...existing.empresas, [userKey]: { ...empresa } },
    });
  }

  async revokeEmpresa(bearerToken: string, userKey: string): Promise<void> {
    const existing = this.map.get(bearerToken);
    if (!existing) return;
    if (!(userKey in existing.empresas)) return;
    const { [userKey]: _, ...rest } = existing.empresas;
    const next: SimpleFacturaSession = { ...existing, empresas: rest };
    if (existing.defaultUserKey === userKey) {
      delete next.defaultUserKey;
    }
    this.map.set(bearerToken, next);
  }

  async setDefault(bearerToken: string, userKey: string | null): Promise<void> {
    const existing = this.map.get(bearerToken);
    if (!existing) return;
    if (userKey === null) {
      const { defaultUserKey: _, ...rest } = existing;
      this.map.set(bearerToken, rest);
      return;
    }
    if (!(userKey in existing.empresas)) {
      throw new Error(`Cannot set default to "${userKey}": no empresa bound under that userKey.`);
    }
    this.map.set(bearerToken, { ...existing, defaultUserKey: userKey });
  }

  async list(): Promise<
    {
      orgId: string;
      empresas: { userKey: string; rutEmisor: string }[];
      defaultUserKey?: string;
      createdAt?: string;
      revokedAt?: string | null;
    }[]
  > {
    return [...this.map.values()].map((s) => ({
      orgId: s.orgId,
      empresas: Object.entries(s.empresas).map(([userKey, e]) => ({
        userKey,
        rutEmisor: e.rutEmisor,
      })),
      ...(s.defaultUserKey ? { defaultUserKey: s.defaultUserKey } : {}),
      ...(s.createdAt ? { createdAt: s.createdAt } : {}),
      ...(s.revokedAt !== undefined ? { revokedAt: s.revokedAt } : {}),
    }));
  }
}

// ---------------------------------------------------------------------
// JsonFileSimpleFacturaSessionStore
// ---------------------------------------------------------------------

interface FileShape {
  sessions: Record<string, SimpleFacturaSession>;
}

export class JsonFileSimpleFacturaSessionStore implements SimpleFacturaAdminStore {
  constructor(public readonly filePath: string) {}

  async resolveBearer(bearerToken: string): Promise<SimpleFacturaSession | null> {
    const data = await this.read();
    const session = data.sessions[bearerToken];
    if (!session || session.revokedAt) return null;
    return session;
  }

  async updateToken(bearerToken: string, token: SimpleFacturaTokenCache): Promise<void> {
    const data = await this.read();
    const existing = data.sessions[bearerToken];
    if (!existing) return;
    data.sessions[bearerToken] = { ...existing, cachedToken: { ...token } };
    await this.write(data);
  }

  async add(
    bearerToken: string,
    session: Omit<SimpleFacturaSession, 'createdAt' | 'empresas'> & {
      empresas?: Record<string, SimpleFacturaEmpresa>;
    },
  ): Promise<void> {
    const data = await this.read();
    data.sessions[bearerToken] = {
      ...session,
      empresas: { ...(session.empresas ?? {}) },
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

  async addEmpresa(
    bearerToken: string,
    userKey: string,
    empresa: SimpleFacturaEmpresa,
  ): Promise<void> {
    const data = await this.read();
    const existing = data.sessions[bearerToken];
    if (!existing) {
      throw new Error('Unknown bearer token: cannot add empresa for org (run `add` first).');
    }
    data.sessions[bearerToken] = {
      ...existing,
      empresas: { ...existing.empresas, [userKey]: { ...empresa } },
    };
    await this.write(data);
  }

  async revokeEmpresa(bearerToken: string, userKey: string): Promise<void> {
    const data = await this.read();
    const existing = data.sessions[bearerToken];
    if (!existing) return;
    if (!(userKey in existing.empresas)) return;
    const { [userKey]: _, ...rest } = existing.empresas;
    const next: SimpleFacturaSession = { ...existing, empresas: rest };
    if (existing.defaultUserKey === userKey) {
      delete next.defaultUserKey;
    }
    data.sessions[bearerToken] = next;
    await this.write(data);
  }

  async setDefault(bearerToken: string, userKey: string | null): Promise<void> {
    const data = await this.read();
    const existing = data.sessions[bearerToken];
    if (!existing) return;
    if (userKey === null) {
      const { defaultUserKey: _, ...rest } = existing;
      data.sessions[bearerToken] = rest;
      await this.write(data);
      return;
    }
    if (!(userKey in existing.empresas)) {
      throw new Error(`Cannot set default to "${userKey}": no empresa bound under that userKey.`);
    }
    data.sessions[bearerToken] = { ...existing, defaultUserKey: userKey };
    await this.write(data);
  }

  async list(): Promise<
    {
      orgId: string;
      empresas: { userKey: string; rutEmisor: string }[];
      defaultUserKey?: string;
      createdAt?: string;
      revokedAt?: string | null;
    }[]
  > {
    const data = await this.read();
    return Object.values(data.sessions).map((s) => ({
      orgId: s.orgId,
      empresas: Object.entries(s.empresas).map(([userKey, e]) => ({
        userKey,
        rutEmisor: e.rutEmisor,
      })),
      ...(s.defaultUserKey ? { defaultUserKey: s.defaultUserKey } : {}),
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

const cloneSession = (session: SimpleFacturaSession): SimpleFacturaSession => ({
  ...session,
  empresas: Object.fromEntries(Object.entries(session.empresas).map(([k, v]) => [k, { ...v }])),
  ...(session.cachedToken ? { cachedToken: { ...session.cachedToken } } : {}),
});

/**
 * Narrow `ctx.auth` from `AuthState` (a discriminated union) down to a
 * SimpleFactura session. Throws when the request didn't authenticate
 * as bearer or when the bearer is unknown / revoked.
 */
export const sessionFromContext = async (
  store: SimpleFacturaSessionStore,
  ctx: HandlerContext,
): Promise<SimpleFacturaSession> => {
  if (ctx.auth.type !== 'bearer') {
    throw new Error('SimpleFactura tools require bearer authentication.');
  }
  const session = await store.resolveBearer(ctx.auth.token);
  if (!session) {
    throw new Error('Unknown bearer token (session expired or revoked).');
  }
  return session;
};

/**
 * The exact `Credenciales` object SimpleFactura expects on every
 * business endpoint. Keys are PascalCase to match what the .NET-based
 * SimpleFactura API deserializes; sending camelCase fails server-side
 * with `Rut de emisor vacio`.
 */
export interface Credenciales {
  EmailUsuario?: string;
  RutEmisor?: string;
  RutContribuyente?: string;
  NombreSucursal?: string;
}

/**
 * Resolve the Credenciales for a given userKey within a session.
 * Falls back to `defaultUserKey` when none is provided. Throws a
 * descriptive error when neither is bound — surfaces a clear failure
 * to the agent instead of an opaque 401 from SimpleFactura.
 */
export const resolveCredenciales = (
  session: SimpleFacturaSession,
  userKey?: string,
): Credenciales => {
  const effectiveKey = userKey ?? session.defaultUserKey;
  if (!effectiveKey) {
    throw new Error(
      `No userKey provided and no default empresa is set for org "${session.orgId}". ` +
        `Use the admin CLI (\`set-default\` or pass an explicit userKey) to bind one.`,
    );
  }
  const empresa = session.empresas[effectiveKey];
  if (!empresa) {
    throw new Error(
      `No empresa bound under userKey "${effectiveKey}" in org "${session.orgId}". ` +
        `Use the admin CLI (\`add-empresa\`) to bind one before calling this tool.`,
    );
  }
  return {
    EmailUsuario: session.email,
    RutEmisor: empresa.rutEmisor,
    ...(empresa.rutContribuyente ? { RutContribuyente: empresa.rutContribuyente } : {}),
    ...(empresa.nombreSucursal ? { NombreSucursal: empresa.nombreSucursal } : {}),
  };
};
