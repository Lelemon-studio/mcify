import { promises as fs } from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { isErrnoException } from '../utils/fs.js';

export type BundleTarget = 'workers' | 'vercel-edge';

export interface BundleOptions {
  configPath: string;
  outDir: string;
  target: BundleTarget;
}

const buildEntryFor = (target: BundleTarget, configPath: string): string => {
  // Both Cloudflare Workers and Vercel Edge need an ESM entry that exports
  // a `fetch` handler. They diverge only in how the runtime hands env in:
  //   - Workers: env is the second arg of `fetch(req, env, ctx)`. Hono
  //     passes it through as `c.env`. createWorkersHandler does the right
  //     thing.
  //   - Vercel Edge: env is exposed via `process.env`. createHttpHandler's
  //     default env resolution reads it.
  if (target === 'workers') {
    return [
      `import config from ${JSON.stringify(configPath)};`,
      `import { createWorkersHandler } from '@mcify/runtime/workers';`,
      ``,
      `const handler = createWorkersHandler(config);`,
      `export default { fetch: handler };`,
      ``,
    ].join('\n');
  }
  if (target === 'vercel-edge') {
    return [
      `export const config = { runtime: 'edge' };`,
      ``,
      `import mcifyConfig from ${JSON.stringify(configPath)};`,
      `import { createHttpHandler } from '@mcify/runtime';`,
      ``,
      `export default createHttpHandler(mcifyConfig);`,
      ``,
    ].join('\n');
  }
  throw new Error(`Unsupported bundle target: ${target as string}`);
};

/**
 * Build an ESM bundle suitable for an edge runtime (Cloudflare Workers,
 * Vercel Edge, Deno Deploy). Bundles all deps inline because edge runtimes
 * don't have npm at runtime — the entire program must be in one file.
 *
 * Returns the absolute path of the produced file.
 */
export const buildEdgeBundle = async (options: BundleOptions): Promise<string> => {
  await fs.mkdir(options.outDir, { recursive: true });
  const entryPath = path.join(options.outDir, '_mcify-entry.mjs');
  const outFile = path.join(
    options.outDir,
    options.target === 'workers' ? 'worker.mjs' : 'edge-function.mjs',
  );

  await fs.writeFile(entryPath, buildEntryFor(options.target, options.configPath), 'utf-8');

  try {
    await esbuild.build({
      entryPoints: [entryPath],
      outfile: outFile,
      bundle: true,
      platform: 'browser',
      format: 'esm',
      target: 'es2022',
      conditions: ['workerd', 'worker', 'browser'],
      mainFields: ['module', 'browser', 'main'],
      sourcemap: 'linked',
      // Inline everything; edge runtimes have no node_modules.
      logLevel: 'silent',
    });
  } finally {
    // Clean up the temp entry. ENOENT means esbuild already inlined it (or
    // we never wrote it because the build threw early). Logging anything
    // else and not re-throwing — `no-unsafe-finally` forbids throwing here,
    // and we don't want to override the original failure cause anyway.
    try {
      await fs.unlink(entryPath);
    } catch (e) {
      if (!(isErrnoException(e) && e.code === 'ENOENT')) {
        console.warn('[mcify deploy] could not remove temporary entry:', e);
      }
    }
  }

  return outFile;
};
