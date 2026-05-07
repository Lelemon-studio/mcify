/**
 * Admin CLI for the multi-tenant Khipu MCP.
 *
 *   pnpm admin add-org <orgId> <apiKey> [environment=dev|live] [bearerToken]
 *   pnpm admin revoke-org <bearerToken>
 *   pnpm admin list
 *
 * Store path defaults to ./sessions.json (cwd). Override with KHIPU_SESSIONS_PATH.
 */

import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { JsonFileKhipuSessionStore, type KhipuEnvironment } from '../src/sessions.js';

const sessionsPath =
  process.env.KHIPU_SESSIONS_PATH ?? path.resolve(process.cwd(), 'sessions.json');
const store = new JsonFileKhipuSessionStore(sessionsPath);

const usage = (): void => {
  process.stdout.write(
    [
      'Usage:',
      '  pnpm admin add-org    <orgId> <apiKey> [environment=dev|live] [bearerToken]',
      '  pnpm admin revoke-org <bearerToken>',
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

const parseEnvironment = (raw: string | undefined): KhipuEnvironment => {
  if (raw === undefined) return 'dev';
  if (raw === 'dev' || raw === 'live') return raw;
  return fail(`environment must be "dev" or "live", got "${raw}".`);
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
    const apiKey = requireArg(args, 2, 'apiKey');
    const environment = parseEnvironment(args[3]);
    const bearerToken = args[4] ?? crypto.randomBytes(32).toString('hex');

    await store.add(bearerToken, { orgId, apiKey, environment });

    process.stdout.write(
      [
        `✓ added org "${orgId}" (${environment})`,
        `  bearer: ${bearerToken}`,
        '',
        'Hand this bearer to the merchant. They paste it in Claude Desktop / Cursor:',
        '  {',
        '    "mcpServers": {',
        '      "khipu": {',
        '        "url": "https://khipu-mcp.your-host.com/mcp",',
        `        "headers": { "authorization": "Bearer ${bearerToken}" }`,
        '      }',
        '    }',
        '  }',
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

  case 'list': {
    const all = await store.list();
    if (all.length === 0) {
      process.stdout.write('(no sessions)\n');
      break;
    }
    for (const row of all) {
      const status = row.revokedAt ? `revoked ${row.revokedAt}` : 'active';
      process.stdout.write(`${row.orgId.padEnd(28)} ${row.environment.padEnd(6)} ${status}\n`);
    }
    break;
  }

  default:
    usage();
    fail(`unknown command "${cmd}".`);
}
