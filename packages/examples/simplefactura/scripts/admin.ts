/**
 * Admin CLI for the multi-tenant SimpleFactura MCP.
 *
 *   pnpm admin add-org <orgId> <email> <password> [bearerToken]
 *   pnpm admin revoke-org <bearerToken>
 *   pnpm admin add-empresa <bearerToken> <userKey> <rutEmisor> [rutContribuyente] [nombreSucursal]
 *   pnpm admin revoke-empresa <bearerToken> <userKey>
 *   pnpm admin set-default <bearerToken> <userKey|->
 *   pnpm admin list
 *
 * Store path defaults to ./sessions.json (cwd). Override with SIMPLEFACTURA_SESSIONS_PATH.
 */

import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { JsonFileSimpleFacturaSessionStore } from '../src/sessions.js';

const sessionsPath =
  process.env.SIMPLEFACTURA_SESSIONS_PATH ?? path.resolve(process.cwd(), 'sessions.json');
const store = new JsonFileSimpleFacturaSessionStore(sessionsPath);

const usage = (): void => {
  process.stdout.write(
    [
      'Usage:',
      '  pnpm admin add-org       <orgId> <email> <password> [bearerToken]',
      '  pnpm admin revoke-org    <bearerToken>',
      '  pnpm admin add-empresa   <bearerToken> <userKey> <rutEmisor> [rutContribuyente] [nombreSucursal]',
      '  pnpm admin revoke-empresa <bearerToken> <userKey>',
      '  pnpm admin set-default   <bearerToken> <userKey | ->',
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
    const email = requireArg(args, 2, 'email');
    const password = requireArg(args, 3, 'password');
    const bearerToken = args[4] ?? crypto.randomBytes(32).toString('hex');

    await store.add(bearerToken, { orgId, email, password });

    process.stdout.write(
      [
        `✓ added org "${orgId}"`,
        `  bearer: ${bearerToken}`,
        '',
        'Hand this bearer to the org. They paste it in Claude Desktop / Cursor:',
        '  {',
        '    "mcpServers": {',
        '      "simplefactura": {',
        '        "url": "https://simplefactura-mcp.your-host.com/mcp",',
        `        "headers": { "authorization": "Bearer ${bearerToken}" }`,
        '      }',
        '    }',
        '  }',
        '',
        'Next: bind one or more empresas. The default mode (one company):',
        `  pnpm admin add-empresa ${bearerToken} default 76.000.000-0`,
        `  pnpm admin set-default ${bearerToken} default`,
        '',
        'Multi-empresa (accountant operating many companies):',
        `  pnpm admin add-empresa ${bearerToken} cliente-1 11.111.111-1`,
        `  pnpm admin add-empresa ${bearerToken} cliente-2 22.222.222-2`,
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

  case 'add-empresa': {
    const bearerToken = requireArg(args, 1, 'bearerToken');
    const userKey = requireArg(args, 2, 'userKey');
    const rutEmisor = requireArg(args, 3, 'rutEmisor');
    const empresa: {
      rutEmisor: string;
      rutContribuyente?: string;
      nombreSucursal?: string;
    } = { rutEmisor };
    if (args[4]) empresa.rutContribuyente = args[4];
    if (args[5]) empresa.nombreSucursal = args[5];

    await store.addEmpresa(bearerToken, userKey, empresa);
    process.stdout.write(`✓ empresa bound: userKey="${userKey}" → rutEmisor="${rutEmisor}"\n`);
    break;
  }

  case 'revoke-empresa': {
    const bearerToken = requireArg(args, 1, 'bearerToken');
    const userKey = requireArg(args, 2, 'userKey');
    await store.revokeEmpresa(bearerToken, userKey);
    process.stdout.write(`✓ empresa revoked for userKey="${userKey}"\n`);
    break;
  }

  case 'set-default': {
    const bearerToken = requireArg(args, 1, 'bearerToken');
    const userKey = requireArg(args, 2, 'userKey');
    if (userKey === '-') {
      await store.setDefault(bearerToken, null);
      process.stdout.write('✓ defaultUserKey cleared\n');
    } else {
      await store.setDefault(bearerToken, userKey);
      process.stdout.write(`✓ defaultUserKey = "${userKey}"\n`);
    }
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
      const summary =
        row.empresas.length === 0 ? '(no empresas)' : `${row.empresas.length} empresa(s)`;
      const def = row.defaultUserKey ? ` default=${row.defaultUserKey}` : '';
      process.stdout.write(`${row.orgId.padEnd(28)} ${status.padEnd(24)} ${summary}${def}\n`);
      for (const e of row.empresas) {
        process.stdout.write(`    └─ ${e.userKey} → ${e.rutEmisor}\n`);
      }
    }
    break;
  }

  default:
    usage();
    fail(`unknown command "${cmd}".`);
}
