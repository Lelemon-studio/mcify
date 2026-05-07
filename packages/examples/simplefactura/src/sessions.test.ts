import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  JsonFileSimpleFacturaSessionStore,
  MemorySimpleFacturaSessionStore,
  resolveCredenciales,
  type SimpleFacturaAdminStore,
  type SimpleFacturaSession,
} from './sessions.js';

const sharedSpec = (factory: () => Promise<SimpleFacturaAdminStore>) => () => {
  let store: SimpleFacturaAdminStore;

  beforeEach(async () => {
    store = await factory();
  });

  it('returns null for unknown tokens', async () => {
    expect(await store.resolveBearer('nope')).toBeNull();
  });

  it('returns the session for a known token', async () => {
    await store.add('tok_abc', { orgId: 'lelemon', email: 'a@b.cl', password: 'p' });
    const session = await store.resolveBearer('tok_abc');
    expect(session?.orgId).toBe('lelemon');
    expect(session?.email).toBe('a@b.cl');
    expect(session?.password).toBe('p');
    expect(session?.empresas).toEqual({});
    expect(session?.createdAt).toBeTruthy();
  });

  it('seeds empresas when provided in `add`', async () => {
    await store.add('tok_abc', {
      orgId: 'lelemon',
      email: 'a@b.cl',
      password: 'p',
      empresas: { default: { rutEmisor: '76.000.000-0' } },
    });
    const session = await store.resolveBearer('tok_abc');
    expect(session?.empresas.default?.rutEmisor).toBe('76.000.000-0');
  });

  it('addEmpresa binds a userKey to a Credenciales row', async () => {
    await store.add('tok_abc', { orgId: 'contador', email: 'a@b.cl', password: 'p' });
    await store.addEmpresa('tok_abc', 'cliente-1', {
      rutEmisor: '11.111.111-1',
      nombreSucursal: 'Casa Matriz',
    });
    await store.addEmpresa('tok_abc', 'cliente-2', { rutEmisor: '22.222.222-2' });

    const session = await store.resolveBearer('tok_abc');
    expect(session?.empresas['cliente-1']?.rutEmisor).toBe('11.111.111-1');
    expect(session?.empresas['cliente-1']?.nombreSucursal).toBe('Casa Matriz');
    expect(session?.empresas['cliente-2']?.rutEmisor).toBe('22.222.222-2');
  });

  it('addEmpresa overwrites silently for an existing userKey', async () => {
    await store.add('tok_abc', { orgId: 'lelemon', email: 'a@b.cl', password: 'p' });
    await store.addEmpresa('tok_abc', 'main', { rutEmisor: '76.000.000-0' });
    await store.addEmpresa('tok_abc', 'main', { rutEmisor: '76.111.111-1' });
    const session = await store.resolveBearer('tok_abc');
    expect(session?.empresas.main?.rutEmisor).toBe('76.111.111-1');
  });

  it('addEmpresa throws for unknown bearer', async () => {
    await expect(store.addEmpresa('nope', 'x', { rutEmisor: '11.111.111-1' })).rejects.toThrow(
      /Unknown bearer/,
    );
  });

  it('revokeEmpresa removes a single binding and clears defaultUserKey if it pointed there', async () => {
    await store.add('tok_abc', { orgId: 'lelemon', email: 'a@b.cl', password: 'p' });
    await store.addEmpresa('tok_abc', 'main', { rutEmisor: '76.000.000-0' });
    await store.addEmpresa('tok_abc', 'side', { rutEmisor: '76.111.111-1' });
    await store.setDefault('tok_abc', 'main');

    await store.revokeEmpresa('tok_abc', 'main');
    const session = await store.resolveBearer('tok_abc');
    expect(session?.empresas).toEqual({ side: { rutEmisor: '76.111.111-1' } });
    expect(session?.defaultUserKey).toBeUndefined();
  });

  it('revokeEmpresa is idempotent', async () => {
    await expect(store.revokeEmpresa('nope', 'x')).resolves.toBeUndefined();
    await store.add('tok_abc', { orgId: 'lelemon', email: 'a@b.cl', password: 'p' });
    await expect(store.revokeEmpresa('tok_abc', 'never-bound')).resolves.toBeUndefined();
  });

  it('setDefault binds and clears the default userKey', async () => {
    await store.add('tok_abc', { orgId: 'lelemon', email: 'a@b.cl', password: 'p' });
    await store.addEmpresa('tok_abc', 'main', { rutEmisor: '76.000.000-0' });
    await store.setDefault('tok_abc', 'main');

    let session = await store.resolveBearer('tok_abc');
    expect(session?.defaultUserKey).toBe('main');

    await store.setDefault('tok_abc', null);
    session = await store.resolveBearer('tok_abc');
    expect(session?.defaultUserKey).toBeUndefined();
  });

  it('setDefault throws when pointing at an unbound userKey', async () => {
    await store.add('tok_abc', { orgId: 'lelemon', email: 'a@b.cl', password: 'p' });
    await expect(store.setDefault('tok_abc', 'never-bound')).rejects.toThrow(/no empresa bound/);
  });

  it('updateToken persists a refreshed JWT into the session', async () => {
    await store.add('tok_abc', { orgId: 'lelemon', email: 'a@b.cl', password: 'p' });
    await store.updateToken('tok_abc', {
      accessToken: 'jwt-fresh',
      expiresAt: '2026-05-08T12:00:00Z',
    });
    const session = await store.resolveBearer('tok_abc');
    expect(session?.cachedToken?.accessToken).toBe('jwt-fresh');
    expect(session?.cachedToken?.expiresAt).toBe('2026-05-08T12:00:00Z');
  });

  it('updateToken on unknown bearer is a no-op', async () => {
    await expect(
      store.updateToken('nope', { accessToken: 'x', expiresAt: '2026-01-01' }),
    ).resolves.toBeUndefined();
  });

  it('revoke makes the token resolve to null', async () => {
    await store.add('tok_abc', { orgId: 'lelemon', email: 'a@b.cl', password: 'p' });
    expect(await store.resolveBearer('tok_abc')).not.toBeNull();
    await store.revoke('tok_abc');
    expect(await store.resolveBearer('tok_abc')).toBeNull();
  });

  it('list reports orgs with empresas, default, and lifecycle timestamps', async () => {
    await store.add('a', { orgId: 'lelemon', email: 'a@b.cl', password: 'p' });
    await store.addEmpresa('a', 'main', { rutEmisor: '76.000.000-0' });
    await store.setDefault('a', 'main');
    await store.add('b', { orgId: 'venpu', email: 'c@d.cl', password: 'q' });
    await store.revoke('b');

    const all = await store.list();
    expect(all).toHaveLength(2);
    const lelemon = all.find((r) => r.orgId === 'lelemon');
    const venpu = all.find((r) => r.orgId === 'venpu');
    expect(lelemon?.empresas).toEqual([{ userKey: 'main', rutEmisor: '76.000.000-0' }]);
    expect(lelemon?.defaultUserKey).toBe('main');
    expect(venpu?.empresas).toEqual([]);
    expect(venpu?.revokedAt).toBeTruthy();
  });

  it('mutations on resolved sessions do not bleed back into the store', async () => {
    await store.add('tok_abc', {
      orgId: 'lelemon',
      email: 'a@b.cl',
      password: 'p',
      empresas: { main: { rutEmisor: '76.000.000-0' } },
    });
    const session = await store.resolveBearer('tok_abc');
    if (session) session.empresas.main!.rutEmisor = 'TAMPERED';
    const fresh = await store.resolveBearer('tok_abc');
    expect(fresh?.empresas.main?.rutEmisor).toBe('76.000.000-0');
  });
};

describe(
  'MemorySimpleFacturaSessionStore',
  sharedSpec(async () => new MemorySimpleFacturaSessionStore()),
);

describe('JsonFileSimpleFacturaSessionStore', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'simplefactura-store-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe(
    'contract',
    sharedSpec(
      async () => new JsonFileSimpleFacturaSessionStore(path.join(tmpDir, 'sessions.json')),
    ),
  );

  it('persists across instances', async () => {
    const file = path.join(tmpDir, 'sessions.json');
    const a = new JsonFileSimpleFacturaSessionStore(file);
    await a.add('tok', { orgId: 'lelemon', email: 'a@b.cl', password: 'p' });
    await a.addEmpresa('tok', 'main', { rutEmisor: '76.000.000-0' });

    const b = new JsonFileSimpleFacturaSessionStore(file);
    const session = await b.resolveBearer('tok');
    expect(session?.orgId).toBe('lelemon');
    expect(session?.empresas.main?.rutEmisor).toBe('76.000.000-0');
  });

  it('handles a missing file by starting empty', async () => {
    const file = path.join(tmpDir, 'does-not-exist.json');
    const store = new JsonFileSimpleFacturaSessionStore(file);
    expect(await store.resolveBearer('anything')).toBeNull();
    expect(await store.list()).toEqual([]);
  });

  it('writes leave a valid file even after multiple sequential mutations', async () => {
    const store = new JsonFileSimpleFacturaSessionStore(path.join(tmpDir, 'sessions.json'));
    for (let i = 0; i < 5; i++) {
      await store.add(`tok_${i}`, { orgId: `org_${i}`, email: `${i}@b.cl`, password: 'p' });
      const reread = new JsonFileSimpleFacturaSessionStore(path.join(tmpDir, 'sessions.json'));
      expect((await reread.list()).length).toBe(i + 1);
    }
  });
});

describe('resolveCredenciales', () => {
  const session: SimpleFacturaSession = {
    orgId: 'contador',
    email: 'contador@studio.cl',
    password: 'pwd',
    empresas: {
      'cliente-1': {
        rutEmisor: '11.111.111-1',
        rutContribuyente: '22.222.222-2',
        nombreSucursal: 'Casa Matriz',
      },
      'cliente-2': { rutEmisor: '33.333.333-3' },
    },
    defaultUserKey: 'cliente-1',
  };

  it('returns the Credenciales (PascalCase keys for SimpleFactura .NET API) for the requested userKey', () => {
    const cred = resolveCredenciales(session, 'cliente-1');
    expect(cred).toEqual({
      EmailUsuario: 'contador@studio.cl',
      RutEmisor: '11.111.111-1',
      RutContribuyente: '22.222.222-2',
      NombreSucursal: 'Casa Matriz',
    });
  });

  it('falls back to defaultUserKey when no userKey is given', () => {
    const cred = resolveCredenciales(session);
    expect(cred.RutEmisor).toBe('11.111.111-1');
  });

  it('omits optional fields when the empresa does not have them', () => {
    const cred = resolveCredenciales(session, 'cliente-2');
    expect(cred).toEqual({
      EmailUsuario: 'contador@studio.cl',
      RutEmisor: '33.333.333-3',
    });
  });

  it('throws descriptively when neither userKey nor default is set', () => {
    const noDefault: SimpleFacturaSession = { ...session, empresas: {} };
    delete noDefault.defaultUserKey;
    expect(() => resolveCredenciales(noDefault)).toThrow(/No userKey provided/);
    expect(() => resolveCredenciales(noDefault)).toThrow(/contador/);
  });

  it('throws descriptively when the userKey is not bound', () => {
    expect(() => resolveCredenciales(session, 'unknown')).toThrow(/No empresa bound/);
    expect(() => resolveCredenciales(session, 'unknown')).toThrow(/unknown/);
  });
});
