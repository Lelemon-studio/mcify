import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { OpenApiDocument } from './types.js';

/**
 * Load an OpenAPI document from a URL or filesystem path. The format is
 * detected by extension first, content sniff second:
 *   - `.yaml` / `.yml` → YAML
 *   - `.json` → JSON
 *   - URL response: pick by `content-type`
 *   - Anything else: try JSON first, fall back to YAML
 */
export const loadOpenApi = async (source: string): Promise<OpenApiDocument> => {
  const { content, contentType } = await readSource(source);
  const ext = path.extname(source).toLowerCase();

  const isYaml =
    ext === '.yaml' ||
    ext === '.yml' ||
    contentType.includes('yaml') ||
    contentType.includes('yml');
  const isJson = ext === '.json' || contentType.includes('json');

  if (isYaml && !isJson) {
    return parseYaml(content) as OpenApiDocument;
  }
  if (isJson) {
    return JSON.parse(content) as OpenApiDocument;
  }

  // Unknown — try JSON first (cheaper failure). YAML is a superset that will
  // also accept JSON, but it's slower and gives a worse error on malformed
  // JSON, so we keep this order.
  try {
    return JSON.parse(content) as OpenApiDocument;
  } catch {
    return parseYaml(content) as OpenApiDocument;
  }
};

interface ReadResult {
  content: string;
  contentType: string;
}

const readSource = async (source: string): Promise<ReadResult> => {
  if (/^https?:\/\//i.test(source)) {
    const res = await fetch(source);
    if (!res.ok) {
      throw new Error(`Failed to fetch OpenAPI spec: ${res.status} ${res.statusText} — ${source}`);
    }
    return {
      content: await res.text(),
      contentType: (res.headers.get('content-type') ?? '').toLowerCase(),
    };
  }

  const absolute = path.resolve(process.cwd(), source);
  const content = await fs.readFile(absolute, 'utf-8');
  return { content, contentType: '' };
};
