import { promises as fs } from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { getString, getBoolean, type ParsedArgs } from '../args.js';
import { log } from '../logger.js';
import { fileExists, isErrnoException } from '../utils/fs.js';

const SUPPORTED_TARGETS = ['node'] as const;
type Target = (typeof SUPPORTED_TARGETS)[number];

const buildEntryFor = (target: Target, configPath: string): string => {
  if (target === 'node') {
    return [
      `import config from ${JSON.stringify(configPath)};`,
      `import { serveNode } from '@mcify/runtime/node';`,
      ``,
      `const port = Number.parseInt(process.env.PORT ?? '8888', 10);`,
      `const server = await serveNode(config, { port });`,
      `process.stdout.write(\`mcify: serving \${config.name} v\${config.version} at \${server.url}\\n\`);`,
      ``,
      `const shutdown = async () => { await server.close(); process.exit(0); };`,
      `process.on('SIGINT', shutdown);`,
      `process.on('SIGTERM', shutdown);`,
    ].join('\n');
  }
  throw new Error(`Build target "${target}" is not supported in this version`);
};

export interface BuildOptions {
  configPath: string;
  outDir: string;
  target: Target;
  bundleDeps: boolean;
}

export const buildServer = async (
  options: BuildOptions,
): Promise<{ outFile: string; durationMs: number }> => {
  const start = Date.now();
  await fs.mkdir(options.outDir, { recursive: true });

  const entryPath = path.join(options.outDir, '_mcify-entry.mjs');
  await fs.writeFile(entryPath, buildEntryFor(options.target, options.configPath), 'utf-8');

  const outFile = path.join(options.outDir, 'server.mjs');

  try {
    await esbuild.build({
      entryPoints: [entryPath],
      outfile: outFile,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node20',
      sourcemap: true,
      ...(options.bundleDeps ? {} : { packages: 'external' }),
      banner: {
        js: 'import { createRequire as __mcifyCreateRequire } from "node:module"; const require = __mcifyCreateRequire(import.meta.url);',
      },
    });
  } finally {
    // The entry file is generated only for esbuild — clean it up after the
    // build whether or not the build itself succeeded. ENOENT is fine
    // (build wrote the entry but esbuild already inlined it; or the build
    // crashed before write). Anything else surfaces.
    try {
      await fs.unlink(entryPath);
    } catch (e) {
      if (!(isErrnoException(e) && e.code === 'ENOENT')) {
        log.warn(`could not remove temporary entry: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return { outFile, durationMs: Date.now() - start };
};

export const runBuild = async (args: ParsedArgs): Promise<void> => {
  const configFlag = getString(args, 'config');
  const configPath = path.resolve(process.cwd(), configFlag ?? 'mcify.config.ts');
  const outFlag = getString(args, 'out');
  const outDir = path.resolve(process.cwd(), outFlag ?? 'dist');
  const targetFlag = (getString(args, 'target') as Target | undefined) ?? 'node';
  const bundleDeps = getBoolean(args, 'bundle-deps') === true;

  if (!(SUPPORTED_TARGETS as readonly string[]).includes(targetFlag)) {
    log.error(`Unsupported target: ${targetFlag}`);
    log.hint(`Available: ${SUPPORTED_TARGETS.join(', ')} (Workers and Bun arrive in Phase D)`);
    process.exit(1);
  }

  if (!(await fileExists(configPath))) {
    log.error(`Config not found: ${configPath}`);
    process.exit(1);
  }

  log.info(`building target=${targetFlag}${bundleDeps ? ' (bundling deps)' : ''}`);
  try {
    const result = await buildServer({
      configPath,
      outDir,
      target: targetFlag,
      bundleDeps,
    });
    const rel = path.relative(process.cwd(), result.outFile) || result.outFile;
    log.success(`${rel} (${result.durationMs}ms)`);
    if (!bundleDeps) {
      log.hint('Production install: `npm install --omit=dev` next to dist/.');
    }
  } catch (e) {
    log.error(`build failed: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
};
