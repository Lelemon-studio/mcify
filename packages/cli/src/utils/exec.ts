import { spawn } from 'node:child_process';

export interface ExecOptions {
  /** Working directory. Defaults to cwd. */
  cwd?: string;
  /** Pipe stdio through to the parent (default) or capture it. */
  stdio?: 'inherit' | 'pipe';
  /** Extra env vars on top of `process.env`. */
  env?: Record<string, string>;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Spawn a process and wait for it. Streams stdio to the parent by default
 * (so users see live progress from `wrangler`/`docker`/etc), or captures it
 * with `stdio: 'pipe'` for tests or programmatic consumption.
 *
 * Resolves with the exit code; never rejects on non-zero (callers decide
 * what to do). Rejects only on spawn failures (binary missing, permission).
 */
export const exec = (
  command: string,
  args: readonly string[],
  options: ExecOptions = {},
): Promise<ExecResult> => {
  const stdio = options.stdio ?? 'inherit';
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...(options.cwd ? { cwd: options.cwd } : {}),
      env: { ...process.env, ...options.env },
      stdio,
      shell: false,
    });

    let stdout = '';
    let stderr = '';
    if (stdio === 'pipe') {
      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
    }

    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ exitCode: code ?? 0, stdout, stderr });
    });
  });
};

/**
 * Check whether a binary is available on PATH. Useful before invoking
 * `wrangler` / `docker` / etc. so we can give a friendly install hint
 * instead of the OS's "command not found" surface.
 */
export const isCommandAvailable = async (command: string): Promise<boolean> => {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  try {
    const result = await exec(probe, [command], { stdio: 'pipe' });
    return result.exitCode === 0;
  } catch {
    return false;
  }
};
