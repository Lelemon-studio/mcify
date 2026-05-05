import { pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';
import type { Config } from '@mcify/core';

/**
 * Load a `mcify.config.ts` (or `.js`/`.mjs`) file at runtime, using `tsx` so
 * users can author config in TypeScript without a compile step.
 *
 * Returns the default export, which must be a {@link Config}.
 */
export const loadConfig = async (configPath: string): Promise<Config> => {
  const moduleUrl = pathToFileURL(configPath).href;
  const mod = (await tsImport(moduleUrl, import.meta.url)) as { default?: unknown };
  if (!mod.default) {
    throw new Error(
      `${configPath} must have a default export. Got: ${typeof mod.default}.\n` +
        `Example: \`export default defineConfig({ ... });\``,
    );
  }
  return mod.default as Config;
};
