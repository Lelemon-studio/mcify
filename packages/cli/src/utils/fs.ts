import { promises as fs } from 'node:fs';

/**
 * Narrow type guard for Node's filesystem `ErrnoException`. We use this
 * everywhere we want to distinguish "file/dir doesn't exist" from real I/O
 * failures (EACCES, EIO, ENOTDIR, etc.) — silently swallowing the latter is
 * the kind of thing that hides real bugs.
 */
export const isErrnoException = (e: unknown): e is NodeJS.ErrnoException =>
  e instanceof Error && typeof (e as NodeJS.ErrnoException).code === 'string';

/**
 * `true` when `target` exists and is reachable. `false` when it doesn't
 * exist (`ENOENT`). Anything else (permissions, I/O errors) is propagated.
 */
export const fileExists = async (target: string): Promise<boolean> => {
  try {
    await fs.access(target);
    return true;
  } catch (e) {
    if (isErrnoException(e) && e.code === 'ENOENT') return false;
    throw e;
  }
};
