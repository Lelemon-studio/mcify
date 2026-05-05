import type { Logger, LogMeta } from '@mcify/core';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

const levelOrder: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

export interface ConsoleLoggerOptions {
  level?: LogLevel;
  bindings?: LogMeta;
  /** Where to write log lines. Defaults to console; stdio mode should pass `'stderr'`. */
  sink?: 'console' | 'stderr';
}

const writeToSink = (sink: 'console' | 'stderr', level: LogLevel, line: string): void => {
  if (sink === 'stderr') {
    const proc = (globalThis as { process?: { stderr?: { write: (s: string) => void } } }).process;
    if (proc?.stderr?.write) {
      proc.stderr.write(line + '\n');
      return;
    }
  }
  // Fallback to console.
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else if (level === 'debug' || level === 'trace') console.debug(line);
  else console.log(line);
};

export const createConsoleLogger = (opts: ConsoleLoggerOptions = {}): Logger => {
  const minLevel = levelOrder[opts.level ?? 'info'];
  const sink = opts.sink ?? 'console';
  const baseBindings = opts.bindings ?? {};

  const make = (bindings: LogMeta): Logger => {
    const log = (lvl: LogLevel) => (msg: string, meta?: LogMeta): void => {
      if (levelOrder[lvl] < minLevel) return;
      const line = JSON.stringify({
        time: new Date().toISOString(),
        level: lvl,
        msg,
        ...bindings,
        ...(meta ?? {}),
      });
      writeToSink(sink, lvl, line);
    };
    const logger: Logger = {
      trace: log('trace'),
      debug: log('debug'),
      info: log('info'),
      warn: log('warn'),
      error: log('error'),
      child: (extra) => make({ ...bindings, ...extra }),
    };
    return logger;
  };

  return make(baseBindings);
};
