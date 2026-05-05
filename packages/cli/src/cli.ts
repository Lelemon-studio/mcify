#!/usr/bin/env node
import { version } from './index.js';

const [, , command] = process.argv;

if (command === '--version' || command === '-v') {
  process.stdout.write(`${version}\n`);
  process.exit(0);
}

process.stdout.write(
  [
    `mcify ${version}`,
    '',
    'Usage: mcify <command>',
    '',
    'Commands:',
    '  init <name>     Scaffold a new MCP server (coming in A.5)',
    '  dev             Run the server with hot reload + inspector (coming in A.5)',
    '  build           Build the server for production (coming in A.5)',
    '  deploy <target> Deploy to Workers / Fly / Railway / Docker (coming in D)',
    '  generate        Generate typed client SDK from server schema (coming in A.5)',
    '',
    'Status: alpha scaffold. Commands not implemented yet.',
    '',
  ].join('\n'),
);
