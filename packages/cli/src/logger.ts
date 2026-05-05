/**
 * Tiny CLI logger. Writes to stderr so stdout stays clean for piping.
 * Color is intentionally minimal — we use ANSI escapes directly when the
 * stream is a TTY, and skip them otherwise. Keeps zero deps for the V1.
 */
const supportsColor = (() => {
  if (process.env['NO_COLOR']) return false;
  if (process.env['FORCE_COLOR']) return true;
  return Boolean(process.stderr.isTTY);
})();

const wrap = (open: string, close: string) => (text: string): string =>
  supportsColor ? `[${open}m${text}[${close}m` : text;

const dim = wrap('2', '22');
const red = wrap('31', '39');
const yellow = wrap('33', '39');
const green = wrap('32', '39');
const cyan = wrap('36', '39');

const write = (line: string): void => {
  process.stderr.write(line);
};

export const log = {
  info: (msg: string): void => write(`${cyan('mcify')} ${msg}\n`),
  success: (msg: string): void => write(`${green('✓')} ${msg}\n`),
  warn: (msg: string): void => write(`${yellow('!')} ${msg}\n`),
  error: (msg: string): void => write(`${red('×')} ${msg}\n`),
  hint: (msg: string): void => write(`${dim(msg)}\n`),
};
