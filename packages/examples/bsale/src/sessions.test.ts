import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  JsonFileBsaleSessionStore,
  MemoryBsaleSessionStore,
  type BsaleAdminStore,
} from './sessions.js';

const sharedSpec = (factory: () => Promise<BsaleAdminStore>) => () => {
  let store: BsaleAdminStore;

  beforeEach(async () => {
    store = await factory();
  });

  it('returns null for unknown tokens', async () => {
    expect(await store.resolveBearer('nope')).toBeNull();
  });

  it('returns the session for a known token', async () => {
    await store.add('tok_abc', { orgId: 'acme', bsaleAccessToken: 'bs_xyz' });
    const session = await store.resolveBearer('tok_abc');
    expect(session?.orgId).toBe('acme');
    expect(session?.bsaleAccessToken).toBe('bs_xyz');
    expect(session?.createdAt).toBeTruthy();
  });

  it('revoke makes the token resolve to null', async () => {
    await store.add('tok_abc', { orgId: 'acme', bsaleAccessToken: 'bs_xyz' });
    expect(await store.resolveBearer('tok_abc')).not.toBeNull();
    await store.revoke('tok_abc');
    expect(await store.resolveBearer('tok_abc')).toBeNull();
  });

  it('revoke is idempotent on unknown tokens', async () => {
    await expect(store.revoke('nope')).resolves.toBeUndefined();
  });

  it('list reports orgs with their lifecycle timestamps', async () => {
    await store.add('a', { orgId: 'alpha', bsaleAccessToken: 'x' });
    await store.add('b', { orgId: 'beta', bsaleAccessToken: 'y' });
    await store.revoke('b');

    const all = await store.list();
    expect(all).toHaveLength(2);
    const alpha = all.find((r) => r.orgId === 'alpha');
    const beta = all.find((r) => r.orgId === 'beta');
    expect(alpha?.revokedAt ?? null).toBeNull();
    expect(beta?.revokedAt).toBeTruthy();
  });
};

describe(
  'MemoryBsaleSessionStore',
  sharedSpec(async () => new MemoryBsaleSessionStore()),
);

describe('JsonFileBsaleSessionStore', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bsale-store-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe(
    'contract',
    sharedSpec(async () => new JsonFileBsaleSessionStore(path.join(tmpDir, 'sessions.json'))),
  );

  it('persists across instances', async () => {
    const file = path.join(tmpDir, 'sessions.json');
    const a = new JsonFileBsaleSessionStore(file);
    await a.add('tok', { orgId: 'acme', bsaleAccessToken: 'bs_xyz' });

    const b = new JsonFileBsaleSessionStore(file);
    expect((await b.resolveBearer('tok'))?.orgId).toBe('acme');
  });

  it('handles a missing file by starting empty', async () => {
    const file = path.join(tmpDir, 'does-not-exist.json');
    const store = new JsonFileBsaleSessionStore(file);
    expect(await store.resolveBearer('anything')).toBeNull();
    expect(await store.list()).toEqual([]);
  });

  it('writes leave a valid file even mid-iteration (tmp+rename atomicity)', async () => {
    const store = new JsonFileBsaleSessionStore(path.join(tmpDir, 'sessions.json'));
    // Sequential — the store does not promise concurrent-write safety from
    // a single process. The contract here is: each completed write produces
    // a valid file readable by a fresh instance.
    for (let i = 0; i < 5; i++) {
      await store.add(`tok_${i}`, { orgId: `org_${i}`, bsaleAccessToken: `bs_${i}` });
      const reread = new JsonFileBsaleSessionStore(path.join(tmpDir, 'sessions.json'));
      const all = await reread.list();
      expect(all.length).toBe(i + 1);
    }
  });
});
