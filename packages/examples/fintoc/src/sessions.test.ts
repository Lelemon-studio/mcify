import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  JsonFileFintocSessionStore,
  MemoryFintocSessionStore,
  getLinkToken,
  type FintocAdminStore,
  type FintocSession,
} from './sessions.js';

const sharedSpec = (factory: () => Promise<FintocAdminStore>) => () => {
  let store: FintocAdminStore;

  beforeEach(async () => {
    store = await factory();
  });

  it('returns null for unknown tokens', async () => {
    expect(await store.resolveBearer('nope')).toBeNull();
  });

  it('returns the session for a known token', async () => {
    await store.add('tok_abc', { orgId: 'acme', secretKey: 'sk_test_xyz' });
    const session = await store.resolveBearer('tok_abc');
    expect(session?.orgId).toBe('acme');
    expect(session?.secretKey).toBe('sk_test_xyz');
    expect(session?.linkTokens).toEqual({});
    expect(session?.createdAt).toBeTruthy();
  });

  it('seeds linkTokens when provided in `add`', async () => {
    await store.add('tok_abc', {
      orgId: 'acme',
      secretKey: 'sk_test_xyz',
      linkTokens: { '11111111-1': 'link_user_a' },
    });
    const session = await store.resolveBearer('tok_abc');
    expect(session?.linkTokens['11111111-1']).toBe('link_user_a');
  });

  it('addLink binds a userKey to a link_token', async () => {
    await store.add('tok_abc', { orgId: 'acme', secretKey: 'sk_test_xyz' });
    await store.addLink('tok_abc', '11111111-1', 'link_user_a');
    const session = await store.resolveBearer('tok_abc');
    expect(session?.linkTokens['11111111-1']).toBe('link_user_a');
  });

  it('addLink overwrites silently for an existing userKey', async () => {
    await store.add('tok_abc', { orgId: 'acme', secretKey: 'sk_test_xyz' });
    await store.addLink('tok_abc', 'user1', 'link_old');
    await store.addLink('tok_abc', 'user1', 'link_new');
    const session = await store.resolveBearer('tok_abc');
    expect(session?.linkTokens.user1).toBe('link_new');
  });

  it('addLink throws for unknown bearer', async () => {
    await expect(store.addLink('nope', 'user1', 'link_x')).rejects.toThrow(/Unknown bearer/);
  });

  it('revokeLink removes a single binding', async () => {
    await store.add('tok_abc', { orgId: 'acme', secretKey: 'sk_test_xyz' });
    await store.addLink('tok_abc', 'user1', 'link_a');
    await store.addLink('tok_abc', 'user2', 'link_b');
    await store.revokeLink('tok_abc', 'user1');
    const session = await store.resolveBearer('tok_abc');
    expect(session?.linkTokens).toEqual({ user2: 'link_b' });
  });

  it('revokeLink is idempotent on unknown bearer / userKey', async () => {
    await expect(store.revokeLink('nope', 'user1')).resolves.toBeUndefined();
    await store.add('tok_abc', { orgId: 'acme', secretKey: 'sk_test_xyz' });
    await expect(store.revokeLink('tok_abc', 'never-bound')).resolves.toBeUndefined();
  });

  it('revoke makes the token resolve to null', async () => {
    await store.add('tok_abc', { orgId: 'acme', secretKey: 'sk_test_xyz' });
    expect(await store.resolveBearer('tok_abc')).not.toBeNull();
    await store.revoke('tok_abc');
    expect(await store.resolveBearer('tok_abc')).toBeNull();
  });

  it('revoke is idempotent on unknown tokens', async () => {
    await expect(store.revoke('nope')).resolves.toBeUndefined();
  });

  it('list reports orgs with their userKeys and lifecycle timestamps', async () => {
    await store.add('a', { orgId: 'alpha', secretKey: 'sk_a' });
    await store.addLink('a', 'user1', 'link_1');
    await store.addLink('a', 'user2', 'link_2');
    await store.add('b', { orgId: 'beta', secretKey: 'sk_b' });
    await store.revoke('b');

    const all = await store.list();
    expect(all).toHaveLength(2);
    const alpha = all.find((r) => r.orgId === 'alpha');
    const beta = all.find((r) => r.orgId === 'beta');
    expect(alpha?.userKeys.sort()).toEqual(['user1', 'user2']);
    expect(alpha?.revokedAt ?? null).toBeNull();
    expect(beta?.userKeys).toEqual([]);
    expect(beta?.revokedAt).toBeTruthy();
  });

  it('mutations on resolved sessions do not bleed back into the store', async () => {
    await store.add('tok_abc', {
      orgId: 'acme',
      secretKey: 'sk_test_xyz',
      linkTokens: { user1: 'link_a' },
    });
    const session = await store.resolveBearer('tok_abc');
    if (session) session.linkTokens.user1 = 'TAMPERED';
    const fresh = await store.resolveBearer('tok_abc');
    expect(fresh?.linkTokens.user1).toBe('link_a');
  });
};

describe(
  'MemoryFintocSessionStore',
  sharedSpec(async () => new MemoryFintocSessionStore()),
);

describe('JsonFileFintocSessionStore', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fintoc-store-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe(
    'contract',
    sharedSpec(async () => new JsonFileFintocSessionStore(path.join(tmpDir, 'sessions.json'))),
  );

  it('persists across instances', async () => {
    const file = path.join(tmpDir, 'sessions.json');
    const a = new JsonFileFintocSessionStore(file);
    await a.add('tok', { orgId: 'acme', secretKey: 'sk_test_xyz' });
    await a.addLink('tok', 'user1', 'link_a');

    const b = new JsonFileFintocSessionStore(file);
    const session = await b.resolveBearer('tok');
    expect(session?.orgId).toBe('acme');
    expect(session?.linkTokens.user1).toBe('link_a');
  });

  it('handles a missing file by starting empty', async () => {
    const file = path.join(tmpDir, 'does-not-exist.json');
    const store = new JsonFileFintocSessionStore(file);
    expect(await store.resolveBearer('anything')).toBeNull();
    expect(await store.list()).toEqual([]);
  });

  it('writes leave a valid file even after multiple sequential mutations', async () => {
    const store = new JsonFileFintocSessionStore(path.join(tmpDir, 'sessions.json'));
    for (let i = 0; i < 5; i++) {
      await store.add(`tok_${i}`, { orgId: `org_${i}`, secretKey: `sk_${i}` });
      const reread = new JsonFileFintocSessionStore(path.join(tmpDir, 'sessions.json'));
      const all = await reread.list();
      expect(all.length).toBe(i + 1);
    }
  });
});

describe('getLinkToken', () => {
  const session: FintocSession = {
    orgId: 'acme',
    secretKey: 'sk_test_xyz',
    linkTokens: { '11111111-1': 'link_a' },
  };

  it('returns the link_token for a known userKey', () => {
    expect(getLinkToken(session, '11111111-1')).toBe('link_a');
  });

  it('throws a descriptive error for an unknown userKey', () => {
    expect(() => getLinkToken(session, '22222222-2')).toThrow(/No Fintoc link bound/);
    expect(() => getLinkToken(session, '22222222-2')).toThrow(/22222222-2/);
    expect(() => getLinkToken(session, '22222222-2')).toThrow(/acme/);
  });
});
