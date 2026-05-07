/**
 * Admin CLI for the multi-tenant Fintoc MCP.
 *
 *   pnpm admin add-org    <orgId> <secretKey> [bearerToken]
 *   pnpm admin revoke-org <bearerToken>
 *   pnpm admin add-link   <bearerToken> <userKey> <linkToken>
 *   pnpm admin revoke-link <bearerToken> <userKey>
 *   pnpm admin list
 *
 * Store path defaults to ./sessions.json (cwd). Override with FINTOC_SESSIONS_PATH.
 *
 * Production: implement {@link FintocSessionStore} against your DB and
 * swap the JSON store for it.
 */

import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { JsonFileFintocSessionStore } from '../src/sessions.js';

const sessionsPath =
  process.env.FINTOC_SESSIONS_PATH ?? path.resolve(process.cwd(), 'sessions.json');
const store = new JsonFileFintocSessionStore(sessionsPath);

const usage = (): void => {
  process.stdout.write(
    [
      'Usage:',
      '  pnpm admin add-org    <orgId> <secretKey> [bearerToken]',
      '  pnpm admin revoke-org <bearerToken>',
      '  pnpm admin add-link   <bearerToken> <userKey> <linkToken>',
      '  pnpm admin revoke-link <bearerToken> <userKey>',
      '  pnpm admin list',
      '',
      `Store: ${sessionsPath}`,
      '',
    ].join('\n'),
  );
};

const fail = (message: string): never => {
  process.stderr.write(`admin: ${message}\n`);
  process.exit(1);
};

const requireArg = (args: string[], index: number, name: string): string => {
  const value = args[index];
  if (value) return value;
  usage();
  return fail(`${name} is required.`);
};

const args = process.argv.slice(2);
const cmd = args[0];

if (!cmd || cmd === '--help' || cmd === '-h') {
  usage();
  process.exit(cmd ? 0 : 1);
}

switch (cmd) {
  case 'add-org': {
    const orgId = requireArg(args, 1, 'orgId');
    const secretKey = requireArg(args, 2, 'secretKey');
    if (!secretKey.startsWith('sk_')) {
      fail('secretKey should start with sk_test_ or sk_live_.');
    }
    const bearerToken = args[3] ?? crypto.randomBytes(32).toString('hex');

    await store.add(bearerToken, { orgId, secretKey });

    process.stdout.write(
      [
        `✓ added org "${orgId}"`,
        `  bearer: ${bearerToken}`,
        '',
        'Hand this bearer to the org. They paste it in Claude Desktop / Cursor:',
        '  {',
        '    "mcpServers": {',
        '      "fintoc": {',
        '        "url": "https://fintoc-mcp.your-host.com/mcp",',
        `        "headers": { "authorization": "Bearer ${bearerToken}" }`,
        '      }',
        '    }',
        '  }',
        '',
        'Next: bind end-user link_tokens with `add-link`:',
        `  pnpm admin add-link ${bearerToken} <userKey> <linkToken>`,
        '',
      ].join('\n'),
    );
    break;
  }

  case 'revoke-org': {
    const bearerToken = requireArg(args, 1, 'bearerToken');
    await store.revoke(bearerToken);
    process.stdout.write('✓ revoked\n');
    break;
  }

  case 'add-link': {
    const bearerToken = requireArg(args, 1, 'bearerToken');
    const userKey = requireArg(args, 2, 'userKey');
    const linkToken = requireArg(args, 3, 'linkToken');
    if (!linkToken.startsWith('link_')) {
      fail('linkToken should start with link_.');
    }
    await store.addLink(bearerToken, userKey, linkToken);
    process.stdout.write(`✓ link bound: userKey="${userKey}" → ${linkToken.slice(0, 12)}…\n`);
    break;
  }

  case 'revoke-link': {
    const bearerToken = requireArg(args, 1, 'bearerToken');
    const userKey = requireArg(args, 2, 'userKey');
    await store.revokeLink(bearerToken, userKey);
    process.stdout.write(`✓ link revoked for userKey="${userKey}"\n`);
    break;
  }

  case 'list': {
    const all = await store.list();
    if (all.length === 0) {
      process.stdout.write('(no sessions)\n');
      break;
    }
    for (const row of all) {
      const status = row.revokedAt ? `revoked ${row.revokedAt}` : 'active';
      const links = row.userKeys.length === 0 ? '(no links)' : `${row.userKeys.length} link(s)`;
      process.stdout.write(`${row.orgId.padEnd(32)} ${status.padEnd(24)} ${links}\n`);
      for (const userKey of row.userKeys) {
        process.stdout.write(`    └─ ${userKey}\n`);
      }
    }
    break;
  }

  default:
    usage();
    fail(`unknown command "${cmd}".`);
}
