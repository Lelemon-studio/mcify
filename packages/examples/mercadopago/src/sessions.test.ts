import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  JsonFileMercadoPagoSessionStore,
  MemoryMercadoPagoSessionStore,
  type MercadoPagoAdminStore,
} from './sessions.js';

const sharedSpec = (factory: () => Promise<MercadoPagoAdminStore>) => () => {
  let store: MercadoPagoAdminStore;
  beforeEach(async () => {
    store = await factory();
  });

  it('returns null for unknown tokens', async () => {
    expect(await store.resolveBearer('nope')).toBeNull();
  });

  it('returns the session for a known token (sandbox)', async () => {
    await store.add('tok_abc', {
      orgId: 'lelemon',
      accessToken: 'TEST-1234',
      environment: 'sandbox',
    });
    const session = await store.resolveBearer('tok_abc');
    expect(session?.orgId).toBe('lelemon');
    expect(session?.accessToken).toBe('TEST-1234');
    expect(session?.environment).toBe('sandbox');
    expect(session?.createdAt).toBeTruthy();
  });

  it('persists `production` environment when set', async () => {
    await store.add('tok_live', {
      orgId: 'venpu',
      accessToken: 'APP_USR-9999',
      environment: 'production',
    });
    const session = await store.resolveBearer('tok_live');
    expect(session?.environment).toBe('production');
  });

  it('revoke makes the token resolve to null', async () => {
    await store.add('tok_abc', { orgId: 'l', accessToken: 'TEST-1', environment: 'sandbox' });
    await store.revoke('tok_abc');
    expect(await store.resolveBearer('tok_abc')).toBeNull();
  });

  it('revoke is idempotent on unknown tokens', async () => {
    await expect(store.revoke('nope')).resolves.toBeUndefined();
  });

  it('list reports orgs with environment + lifecycle', async () => {
    await store.add('a', { orgId: 'sand', accessToken: 'TEST-1', environment: 'sandbox' });
    await store.add('b', { orgId: 'prod', accessToken: 'APP_USR-2', environment: 'production' });
    await store.revoke('b');

    const all = await store.list();
    expect(all).toHaveLength(2);
    const sand = all.find((r) => r.orgId === 'sand');
    const prod = all.find((r) => r.orgId === 'prod');
    expect(sand?.environment).toBe('sandbox');
    expect(prod?.environment).toBe('production');
    expect(prod?.revokedAt).toBeTruthy();
  });

  it('mutations on resolved sessions do not bleed back into the store', async () => {
    await store.add('tok_abc', {
      orgId: 'l',
      accessToken: 'TEST-original',
      environment: 'sandbox',
    });
    const session = await store.resolveBearer('tok_abc');
    if (session) (session as { accessToken: string }).accessToken = 'TAMPERED';
    const fresh = await store.resolveBearer('tok_abc');
    expect(fresh?.accessToken).toBe('TEST-original');
  });
};

describe(
  'MemoryMercadoPagoSessionStore',
  sharedSpec(async () => new MemoryMercadoPagoSessionStore()),
);

describe('JsonFileMercadoPagoSessionStore', () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mp-store-'));
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe(
    'contract',
    sharedSpec(async () => new JsonFileMercadoPagoSessionStore(path.join(tmpDir, 'sessions.json'))),
  );

  it('persists across instances', async () => {
    const file = path.join(tmpDir, 'sessions.json');
    const a = new JsonFileMercadoPagoSessionStore(file);
    await a.add('tok', {
      orgId: 'lelemon',
      accessToken: 'APP_USR-1',
      environment: 'production',
    });
    const b = new JsonFileMercadoPagoSessionStore(file);
    const session = await b.resolveBearer('tok');
    expect(session?.environment).toBe('production');
  });

  it('handles a missing file', async () => {
    const file = path.join(tmpDir, 'nope.json');
    const store = new JsonFileMercadoPagoSessionStore(file);
    expect(await store.resolveBearer('x')).toBeNull();
    expect(await store.list()).toEqual([]);
  });
});
