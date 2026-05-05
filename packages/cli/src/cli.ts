#!/usr/bin/env node
import { parseArgs } from './args.js';
import { runInit } from './commands/init.js';
import { runDev } from './commands/dev.js';
import { runBuild } from './commands/build.js';
import { runGenerate } from './commands/generate.js';
import { runDeploy } from './commands/deploy.js';
import { log } from './logger.js';
import { version } from './index.js';

const HELP = `
mcify ${version}

Usage:
  mcify <command> [options]

Commands:
  init <name>              Scaffold a new MCP server
                             --template <name>     Template (default: from-scratch)
                             --dir <path>          Target directory (default: ./<name>)

  dev                      Run the server locally with hot reload
                             --port <number>       Default: 8888
                             --config <path>       Default: ./mcify.config.ts
                             --no-watch            Disable file watching

  build                    Bundle the server for deployment
                             --target <name>       node (default; workers/bun in Phase D)
                             --out <path>          Default: ./dist
                             --config <path>       Default: ./mcify.config.ts
                             --bundle-deps         Inline node_modules into the output

  deploy <target>          Deploy to a hosting target
                             cloudflare            Cloudflare Workers (via wrangler)
                             vercel                Vercel Edge Functions
                             docker                Build a Docker image (optional push)
                             --dry-run             Don't actually deploy
                             --help                Per-target options

  generate                 Emit a typed client stub from your config
                             --config <path>       Default: ./mcify.config.ts
                             --out <path>          Default: ./mcify-client.ts

  --version, -v            Print mcify version
  --help, -h               Show this help

Docs: https://mcify.dev
`;

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const command = args.positional[0];

  if (args.flags['version'] || args.flags['v']) {
    process.stdout.write(`${version}\n`);
    return;
  }
  if (!command || args.flags['help'] || args.flags['h']) {
    process.stdout.write(`${HELP.trim()}\n`);
    return;
  }

  switch (command) {
    case 'init':
      await runInit(args);
      return;
    case 'dev':
      await runDev(args);
      return;
    case 'build':
      await runBuild(args);
      return;
    case 'deploy':
      await runDeploy(args);
      return;
    case 'generate':
      await runGenerate(args);
      return;
    default:
      log.error(`Unknown command: ${command}`);
      process.stdout.write(`${HELP.trim()}\n`);
      process.exit(1);
  }
};

main().catch((e: unknown) => {
  const message = e instanceof Error ? e.message : String(e);
  log.error(message);
  if (e instanceof Error && e.stack && process.env['MCIFY_DEBUG']) {
    process.stderr.write(`${e.stack}\n`);
  }
  process.exit(1);
});
