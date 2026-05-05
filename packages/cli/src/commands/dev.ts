import { promises as fs } from 'node:fs';
import path from 'node:path';
import chokidar from 'chokidar';
import { serveNode, type NodeServer } from '@mcify/runtime/node';
import { loadConfig } from '../config-loader.js';
import { getString, getBoolean, type ParsedArgs } from '../args.js';
import { log } from '../logger.js';

interface DevOptions {
  port: number;
  configPath: string;
  watch: boolean;
}

const fileExists = async (target: string): Promise<boolean> => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

const startOnce = async (opts: DevOptions): Promise<NodeServer> => {
  const config = await loadConfig(opts.configPath);
  const server = await serveNode(config, { port: opts.port });
  log.success(`${config.name} v${config.version}`);
  log.info(server.url);
  return server;
};

export const runDev = async (args: ParsedArgs): Promise<void> => {
  const portFlag = getString(args, 'port');
  const port = portFlag ? Number.parseInt(portFlag, 10) : 8888;
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    log.error(`Invalid --port value: ${portFlag}`);
    process.exit(1);
  }

  const configFlag = getString(args, 'config');
  const configPath = path.resolve(process.cwd(), configFlag ?? 'mcify.config.ts');
  const watch = getBoolean(args, 'watch') !== false;

  if (!(await fileExists(configPath))) {
    log.error(`Config not found: ${configPath}`);
    log.hint('Run `mcify init <name>` to scaffold a starter project.');
    process.exit(1);
  }

  const opts: DevOptions = { port, configPath, watch };

  let server: NodeServer | null = null;
  let restarting = false;

  const start = async (): Promise<void> => {
    try {
      server = await startOnce(opts);
    } catch (e) {
      log.error(`failed to start: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const restart = async (): Promise<void> => {
    if (restarting) return;
    restarting = true;
    try {
      log.info('reloading...');
      if (server) {
        await server.close();
        server = null;
      }
      await start();
    } finally {
      restarting = false;
    }
  };

  await start();

  if (watch) {
    const cwd = process.cwd();
    const watcher = chokidar.watch(cwd, {
      ignored: [
        /(^|[\\/])\../, // dotfiles
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/.turbo/**',
        '**/coverage/**',
      ],
      ignoreInitial: true,
      persistent: true,
    });
    watcher.on('change', (changedPath) => {
      log.hint(`changed: ${path.relative(cwd, changedPath)}`);
      void restart();
    });
    watcher.on('error', (e) => {
      const err = e instanceof Error ? e : new Error(String(e));
      log.warn(`watcher error: ${err.message}`);
    });
    log.hint(`watching ${cwd}`);
  }

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    log.info(`received ${signal}, shutting down`);
    if (server) await server.close().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
};
