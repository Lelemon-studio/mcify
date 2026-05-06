import path from 'node:path';
import { generateFromOpenApi } from '../openapi/generate.js';
import { loadOpenApi } from '../openapi/load.js';
import type { ParsedArgs } from '../args.js';
import { getString, getStrings } from '../args.js';
import { log } from '../logger.js';

interface SpecEntry {
  prefix: string;
  source: string;
}

/**
 * Parse `--spec <prefix>=<url>` flags. The user can repeat the flag for
 * multi-microservice setups (`--spec users=... --spec billing=...`). A bare
 * positional argument is also accepted; the prefix defaults to the spec's
 * `info.title` slug or the filename.
 */
const collectSpecs = (args: ParsedArgs): SpecEntry[] => {
  const out: SpecEntry[] = [];
  for (const raw of getStrings(args, 'spec')) {
    const eq = raw.indexOf('=');
    if (eq === -1) {
      out.push({ prefix: '', source: raw });
    } else {
      out.push({ prefix: raw.slice(0, eq), source: raw.slice(eq + 1) });
    }
  }
  // The `from-openapi` subcommand also accepts a single bare positional
  // for the simple-case "one spec, one file" flow.
  // positional[0] is "generate", positional[1] is "from-openapi" (the
  // subcommand), positional[2] is the spec source.
  const bare = args.positional[2];
  if (bare && out.length === 0) {
    out.push({ prefix: '', source: bare });
  }
  return out;
};

const slugify = (input: string): string =>
  input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'service';

const inferPrefix = (entry: SpecEntry, fallback: string): string => {
  if (entry.prefix) return slugify(entry.prefix);
  // Fallback: the doc's info.title. Caller passes that here.
  return slugify(fallback);
};

export const runGenerateFromOpenApi = async (args: ParsedArgs): Promise<void> => {
  const specs = collectSpecs(args);
  if (specs.length === 0) {
    log.error('mcify generate from-openapi: no spec supplied');
    log.hint('Usage: mcify generate from-openapi <spec> [--out <dir>]');
    log.hint(
      '       mcify generate from-openapi --spec users=https://... --spec billing=./billing.yaml',
    );
    process.exit(1);
  }

  const outDir = path.resolve(process.cwd(), getString(args, 'out') ?? 'src/generated');

  const results: { prefix: string; toolCount: number; outFile: string }[] = [];

  for (const entry of specs) {
    log.info(`loading ${entry.source}`);
    let document;
    try {
      document = await loadOpenApi(entry.source);
    } catch (e) {
      log.error(`failed to load ${entry.source}: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }

    const prefix = inferPrefix(entry, document.info.title);

    const result = await generateFromOpenApi({
      source: entry.source,
      outDir,
      prefix,
      document,
    });

    log.success(
      `${prefix}: ${result.toolCount} tools → ${path.relative(process.cwd(), result.outFile)}`,
    );
    results.push({ prefix, toolCount: result.toolCount, outFile: result.outFile });
  }

  if (results.length > 1) {
    log.info('Mix all generated tools into your mcify.config.ts:');
    for (const r of results) {
      log.hint(
        `  import { ${r.prefix}_tools, create_${r.prefix}_client } from './generated/${r.prefix}.js';`,
      );
    }
    log.hint('  tools: [');
    for (const r of results) {
      log.hint(`    ...${r.prefix}_tools(create_${r.prefix}_client({ token: ... })),`);
    }
    log.hint('  ],');
  }
};
