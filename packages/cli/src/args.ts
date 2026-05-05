export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

/**
 * Minimal argv parser used by the mcify CLI. Supports:
 *   - `--name value`    → flags.name = "value"
 *   - `--name=value`    → flags.name = "value"
 *   - `--flag`          → flags.flag = true
 *   - `--no-flag`       → flags.flag = false
 *   - `-x`              → flags.x = true
 *   - `--`              → everything after this is positional
 */
export const parseArgs = (argv: readonly string[]): ParsedArgs => {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) continue;

    if (arg === '--') {
      for (let j = i + 1; j < argv.length; j += 1) {
        const rest = argv[j];
        if (rest !== undefined) positional.push(rest);
      }
      break;
    }

    if (arg.startsWith('--')) {
      const body = arg.slice(2);
      const eq = body.indexOf('=');
      if (eq >= 0) {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
        continue;
      }
      if (body.startsWith('no-')) {
        flags[body.slice(3)] = false;
        continue;
      }
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        flags[body] = next;
        i += 1;
      } else {
        flags[body] = true;
      }
      continue;
    }

    if (arg.startsWith('-') && arg.length > 1) {
      flags[arg.slice(1)] = true;
      continue;
    }

    positional.push(arg);
  }

  return { positional, flags };
};

export const getString = (args: ParsedArgs, name: string): string | undefined => {
  const value = args.flags[name];
  return typeof value === 'string' ? value : undefined;
};

export const getBoolean = (args: ParsedArgs, name: string): boolean | undefined => {
  const value = args.flags[name];
  return typeof value === 'boolean' ? value : undefined;
};
