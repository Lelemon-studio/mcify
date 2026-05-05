import type { AuthConfig } from './auth/types.js';
import type { Tool } from './tool.js';
import type { Resource } from './resource.js';
import type { Prompt } from './prompt.js';

export interface Config {
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly auth?: AuthConfig;
  readonly tools?: readonly Tool[];
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
