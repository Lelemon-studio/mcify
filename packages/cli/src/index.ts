export const version = '0.0.1-alpha.0';

// Programmatic API (rare — most usage is via the CLI binary).
export { init } from './commands/init.js';
export type { InitOptions } from './commands/init.js';
export { buildServer } from './commands/build.js';
export type { BuildOptions } from './commands/build.js';
export { loadConfig } from './config-loader.js';
export { parseArgs } from './args.js';
export type { ParsedArgs } from './args.js';
