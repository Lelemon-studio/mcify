import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Resolves the on-disk location of the `templates/` directory shipped with
 * the CLI. Works in both dev (running from `dist/`) and published packages
 * (`node_modules/@mcify/cli/dist/cli.js`).
 */
export const getTemplatesRoot = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  // dist/cli.js → ../templates ; src/cli.ts (vitest) → ../templates as well.
  return resolve(here, '..', 'templates');
};
