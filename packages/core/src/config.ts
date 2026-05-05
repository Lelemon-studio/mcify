import type { AuthConfig } from './auth/types.js';
import type { Tool } from './tool.js';
import type { Resource } from './resource.js';
import type { Prompt } from './prompt.js';

/**
 * Storage type for tools inside a Config. We use `any` for the schema
 * generics intentionally — TypeScript's variance rules make stricter types
 * (`Tool<ZodType, ZodType>`) reject the specific `Tool<ZodObject<X>, ZodObject<Y>>`
 * instances `defineTool` returns, because the schema types appear in both
 * covariant (`input`) and contravariant (`handler` parameter) positions.
 *
 * Full type narrowing is preserved at the `defineTool` call site; only the
 * heterogeneous Config array uses the erased shape.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTool = Tool<any, any>;

export interface Config {
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly auth?: AuthConfig;
  readonly tools?: readonly AnyTool[];
  readonly resources?: readonly Resource[];
  readonly prompts?: readonly Prompt[];
}

export function defineConfig(config: Config): Config {
  if (!config.name) throw new TypeError('defineConfig: `name` is required');
  if (!config.version) throw new TypeError('defineConfig: `version` is required');

  const seenTools = new Set<string>();
  for (const t of config.tools ?? []) {
    if (seenTools.has(t.name)) {
      throw new Error(`defineConfig: duplicate tool name "${t.name}"`);
    }
    seenTools.add(t.name);
  }

  const seenResources = new Set<string>();
  for (const r of config.resources ?? []) {
    if (seenResources.has(r.uri)) {
      throw new Error(`defineConfig: duplicate resource URI "${r.uri}"`);
    }
    seenResources.add(r.uri);
  }

  const seenPrompts = new Set<string>();
  for (const p of config.prompts ?? []) {
    if (seenPrompts.has(p.name)) {
      throw new Error(`defineConfig: duplicate prompt name "${p.name}"`);
    }
    seenPrompts.add(p.name);
  }

  return Object.freeze({ ...config });
}
