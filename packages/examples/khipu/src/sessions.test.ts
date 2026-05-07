import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  JsonFileKhipuSessionStore,
  MemoryKhipuSessionStore,
  type KhipuAdminStore,
} from './sessions.js';

const sharedSpec = (factory: () => Promise<KhipuAdminStore>) => () => {
  let store: KhipuAdminStore;

  beforeEach(async () => {
    store = await factory();
  });

  it('returns null for unknown tokens', async () => {
    expect(await store.resolveBearer('nope')).toBeNull();
  });

  it('returns the session for a known token (dev environment)', async () => {
    await store.add('tok_abc', {
      orgId: 'lelemon',
      apiKey: 'kp_dev_xyz',
      environment: 'dev',
    });
    const session = await store.resolveBearer('tok_abc');
    expect(session?.orgId).toBe('lelemon');
    expect(session?.apiKey).toBe('kp_dev_xyz');
    expect(session?.environment).toBe('dev');
    expect(session?.createdAt).toBeTruthy();
  });

  it('persists `live` environment when set', async () => {
    await store.add('tok_live', {
      orgId: 'venpu',
      apiKey: 'kp_live_xyz',
      environment: 'live',
    });
    const session = await store.resolveBearer('tok_live');
    expect(session?.environment).toBe('live');
  });

  it('revoke makes the token resolve to null', async () => {
    await store.add('tok_abc', { orgId: 'lelemon', apiKey: 'kp_xyz', environment: 'dev' });
    expect(await store.resolveBearer('tok_abc')).not.toBeNull();
    await store.revoke('tok_abc');
    expect(await store.resolveBearer('tok_abc')).toBeNull();
  });

  it('revoke is idempotent on unknown tokens', async () => {
    await expect(store.revoke('nope')).resolves.toBeUndefined();
  });

  it('list reports orgs with environment and lifecycle timestamps', async () => {
    await store.add('a', { orgId: 'lelemon-dev', apiKey: 'kp_dev_a', environment: 'dev' });
    await store.add('b', { orgId: 'lelemon-prod', apiKey: 'kp_live_b', environment: 'live' });
    await store.revoke('b');

    const all = await store.list();
    expect(all).toHaveLength(2);
    const a = all.find((r) => r.orgId === 'lelemon-dev');
    const b = all.find((r) => r.orgId === 'lelemon-prod');
    expect(a?.environment).toBe('dev');
    expect(a?.revokedAt ?? null).toBeNull();
    expect(b?.environment).toBe('live');
    expect(b?.revokedAt).toBeTruthy();
  });

  it('mutations on resolved sessions do not bleed back into the store', async () => {
    await store.add('tok_abc', { orgId: 'lelemon', apiKey: 'kp_xyz', environment: 'dev' });
    const session = await store.resolveBearer('tok_abc');
    if (session) (session as { apiKey: string }).apiKey = 'TAMPERED';
    const fresh = await store.resolveBearer('tok_abc');
    expect(fresh?.apiKey).toBe('kp_xyz');
  });
};

describe(
  'MemoryKhipuSessionStore',
  sharedSpec(async () => new MemoryKhipuSessionStore()),
);

describe('JsonFileKhipuSessionStore', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'khipu-store-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe(
    'contract',
    sharedSpec(async () => new JsonFileKhipuSessionStore(path.join(tmpDir, 'sessions.json'))),
  );

  it('persists across instances', async () => {
    const file = path.join(tmpDir, 'sessions.json');
    const a = new JsonFileKhipuSessionStore(file);
    await a.add('tok', { orgId: 'lelemon', apiKey: 'kp_xyz', environment: 'live' });

    const b = new JsonFileKhipuSessionStore(file);
    const session = await b.resolveBearer('tok');
    expect(session?.orgId).toBe('lelemon');
    expect(session?.environment).toBe('live');
  });

  it('handles a missing file by starting empty', async () => {
    const file = path.join(tmpDir, 'does-not-exist.json');
    const store = new JsonFileKhipuSessionStore(file);
    expect(await store.resolveBearer('anything')).toBeNull();
    expect(await store.list()).toEqual([]);
  });

  it('writes leave a valid file even after multiple sequential mutations', async () => {
    const store = new JsonFileKhipuSessionStore(path.join(tmpDir, 'sessions.json'));
    for (let i = 0; i < 5; i++) {
      await store.add(`tok_${i}`, {
        orgId: `org_${i}`,
        apiKey: `kp_${i}`,
        environment: i % 2 === 0 ? 'dev' : 'live',
      });
      const reread = new JsonFileKhipuSessionStore(path.join(tmpDir, 'sessions.json'));
      expect((await reread.list()).length).toBe(i + 1);
    }
  });
});
