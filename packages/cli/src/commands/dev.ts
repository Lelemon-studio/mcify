import { createRequire } from 'node:module';
import path from 'node:path';
import chokidar from 'chokidar';
import type { Config } from '@mcify/core';
import { EventBus } from '@mcify/runtime';
import { serveNode, type NodeServer } from '@mcify/runtime/node';
import { startInspectorServer, type InspectorServer } from '@mcify/runtime/inspector';
import { loadConfig } from '../config-loader.js';
import { getString, getBoolean, type ParsedArgs } from '../args.js';
import { log } from '../logger.js';
import { fileExists, isErrnoException } from '../utils/fs.js';

/**
 * Resolve the on-disk path of `@mcify/inspector`'s built static assets.
 * Returns null **only** when the package is genuinely not installed
 * (`MODULE_NOT_FOUND`). Any other error — broken install, malformed
 * package.json, etc. — is propagated so we never silently degrade.
 */
const resolveInspectorStaticRoot = (): string | null => {
  try {
    const require_ = createRequire(import.meta.url);
    const pkgPath = require_.resolve('@mcify/inspector/package.json');
    return path.join(path.dirname(pkgPath), 'dist');
  } catch (e) {
    if (isErrnoException(e) && e.code === 'MODULE_NOT_FOUND') return null;
    throw e;
  }
};

const closeQuietly = async (label: string, fn: () => Promise<void>): Promise<void> => {
  try {
    await fn();
  } catch (e) {
    log.warn(`${label} failed to close cleanly: ${e instanceof Error ? e.message : String(e)}`);
  }
};

export const runDev = async (args: ParsedArgs): Promise<void> => {
  const portFlag = getString(args, 'port');
  const port = portFlag ? Number.parseInt(portFlag, 10) : 8888;
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    log.error(`Invalid --port value: ${portFlag}`);
    process.exit(1);
  }

  const inspectorPortFlag = getString(args, 'inspector-port');
  const inspectorPort = inspectorPortFlag ? Number.parseInt(inspectorPortFlag, 10) : 3001;
  if (!Number.isFinite(inspectorPort) || inspectorPort <= 0 || inspectorPort > 65535) {
    log.error(`Invalid --inspector-port value: ${inspectorPortFlag}`);
    process.exit(1);
  }

  const inspectorEnabled = getBoolean(args, 'inspector') !== false;
  const configFlag = getString(args, 'config');
  const configPath = path.resolve(process.cwd(), configFlag ?? 'mcify.config.ts');
  const watch = getBoolean(args, 'watch') !== false;

  if (!(await fileExists(configPath))) {
    log.error(`Config not found: ${configPath}`);
    log.hint('Run `mcify init <name>` to scaffold a starter project.');
    process.exit(1);
  }

  // Shared event bus. The MCP server emits tool/resource/prompt telemetry; the
  // inspector consumes it via WS.
  const bus = new EventBus();

  let server: NodeServer | null = null;
  let inspector: InspectorServer | null = null;
  let restarting = false;

  const startMcpServer = async (config: Config): Promise<void> => {
    server = await serveNode(config, { port, eventBus: bus });
  };

  const startInspector = async (config: Config): Promise<void> => {
    if (!inspectorEnabled) return;
    const staticRoot = resolveInspectorStaticRoot();
    if (!staticRoot) {
      log.warn('@mcify/inspector not found — inspector UI disabled.');
      log.hint('Run `pnpm add -D @mcify/inspector` to enable it.');
      return;
    }
    inspector = await startInspectorServer(config, {
      port: inspectorPort,
      staticRoot,
      eventBus: bus,
    });
  };

  const start = async (): Promise<void> => {
    try {
      const config = await loadConfig(configPath);
      await startMcpServer(config);
      if (!inspector) {
        await startInspector(config);
      } else {
        inspector.setConfig(config);
      }
      log.success(`${config.name} v${config.version}`);
      const mcpServer = server;
      if (mcpServer) {
        log.info(`MCP       ${mcpServer.url}/mcp`);
      }
      if (inspector) {
        log.info(`inspector ${inspector.url}`);
      }
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
        /(^|[\\/])\../,
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
    const currentInspector = inspector;
    const currentServer = server;
    if (currentInspector) await closeQuietly('inspector', () => currentInspector.close());
    if (currentServer) await closeQuietly('mcp server', () => currentServer.close());
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
};
