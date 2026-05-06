export interface ParsedArgs {
  positional: string[];
  /**
   * A flag's value is `string | boolean` for one-shot flags. When the same
   * flag is passed multiple times (`--spec a --spec b`), the accumulated
   * values land here as `string[]` — read them with {@link getStrings}.
   */
  flags: Record<string, string | boolean | string[]>;
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
  const flags: Record<string, string | boolean | string[]> = {};

  // Accumulate `--name value` when the same name shows up more than once.
  // The first repeat promotes the value to an array; subsequent repeats
  // append. Booleans don't accumulate — passing `--flag` twice is the same
  // as passing it once.
  const setStringFlag = (name: string, value: string): void => {
    const current = flags[name];
    if (typeof current === 'string') {
      flags[name] = [current, value];
    } else if (Array.isArray(current)) {
      current.push(value);
    } else {
      flags[name] = value;
    }
  };

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
        setStringFlag(body.slice(0, eq), body.slice(eq + 1));
        continue;
      }
      if (body.startsWith('no-')) {
        flags[body.slice(3)] = false;
        continue;
      }
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        setStringFlag(body, next);
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
  if (typeof value === 'string') return value;
  // For one-call sites, return the last value if the flag was repeated
  // accidentally — preserves backward compat for any caller that didn't
  // expect arrays.
  if (Array.isArray(value)) return value[value.length - 1];
  return undefined;
};

export const getStrings = (args: ParsedArgs, name: string): string[] => {
  const value = args.flags[name];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.slice();
  return [];
};

export const getBoolean = (args: ParsedArgs, name: string): boolean | undefined => {
  const value = args.flags[name];
  return typeof value === 'boolean' ? value : undefined;
};
