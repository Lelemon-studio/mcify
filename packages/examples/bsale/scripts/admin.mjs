#!/usr/bin/env node
// Admin CLI for the multi-tenant Bsale MCP.
// Usage:
//   node scripts/admin.mjs add <orgId> [bearerToken] [bsaleToken]
//   node scripts/admin.mjs revoke <bearerToken>
//   node scripts/admin.mjs list
//
// If `bearerToken` is omitted on `add`, a fresh one is generated and
// printed (so you can hand it to the org).
//
// The store path defaults to ./sessions.json (relative to cwd) and can
// be overridden with BSALE_SESSIONS_PATH.
//
// In production you'd run this against your DB instead of a JSON file —
// swap JsonFileBsaleSessionStore for your own implementation.

import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// The compiled output lives in dist/; for dev, fall back to tsx via the
// node --import flag. We stick to plain JS here so this script works
// without a build step.
const distPath = path.join(here, '..', 'dist', 'src', 'sessions.js');
let JsonFileBsaleSessionStore;
try {
  ({ JsonFileBsaleSessionStore } = await import(distPath));
} catch (e) {
  if (e?.code !== 'ERR_MODULE_NOT_FOUND') throw e;
  process.stderr.write(
    'admin: dist not found. Run `pnpm build` (or `tsc -p tsconfig.json`) first.\n',
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const cmd = args[0];

const sessionsPath =
  process.env.BSALE_SESSIONS_PATH ?? path.resolve(process.cwd(), 'sessions.json');
const store = new JsonFileBsaleSessionStore(sessionsPath);

const usage = () => {
  process.stdout.write(
    [
      'Usage:',
      '  node scripts/admin.mjs add <orgId> [bearerToken] [bsaleToken]',
      '  node scripts/admin.mjs revoke <bearerToken>',
      '  node scripts/admin.mjs list',
      '',
      `Store: ${sessionsPath}`,
      '',
    ].join('\n'),
  );
};

if (!cmd || cmd === '--help' || cmd === '-h') {
  usage();
  process.exit(cmd ? 0 : 1);
}

if (cmd === 'add') {
  const orgId = args[1];
  if (!orgId) {
    process.stderr.write('admin: orgId is required.\n');
    usage();
    process.exit(1);
  }

  let bearerToken = args[2];
  const bsaleToken = args[3];
  if (!bsaleToken) {
    process.stderr.write('admin: bsaleToken is required.\n');
    process.stderr.write('  Get one at https://app.bsale.io/configuration/api\n');
    usage();
    process.exit(1);
  }
  if (!bearerToken) {
    bearerToken = crypto.randomBytes(32).toString('hex');
  }

  await store.add(bearerToken, { orgId, bsaleAccessToken: bsaleToken });

  process.stdout.write(
    [
      `✓ added org "${orgId}"`,
      `  bearer: ${bearerToken}`,
      '',
      'Hand this bearer to the org. They paste it in Claude Desktop / Cursor:',
      '  {',
      '    "mcpServers": {',
      '      "bsale": {',
      `        "url": "https://bsale-mcp.your-host.com/mcp",`,
      `        "headers": { "authorization": "Bearer ${bearerToken}" }`,
      '      }',
      '    }',
      '  }',
      '',
    ].join('\n'),
  );
  process.exit(0);
}

if (cmd === 'revoke') {
  const bearerToken = args[1];
  if (!bearerToken) {
    process.stderr.write('admin: bearerToken is required.\n');
    process.exit(1);
  }
  await store.revoke(bearerToken);
  process.stdout.write(`✓ revoked\n`);
  process.exit(0);
}

if (cmd === 'list') {
  const all = await store.list();
  if (all.length === 0) {
    process.stdout.write('(no sessions)\n');
    process.exit(0);
  }
  for (const row of all) {
    const status = row.revokedAt ? `revoked ${row.revokedAt}` : 'active';
    process.stdout.write(`${row.orgId.padEnd(32)} ${status}\n`);
  }
  process.exit(0);
}

process.stderr.write(`admin: unknown command "${cmd}"\n`);
usage();
process.exit(1);
