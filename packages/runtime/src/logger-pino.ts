import pino, { type Logger as PinoLogger, type DestinationStream } from 'pino';
import type { Logger, LogMeta } from '@mcify/core';

export type PinoLogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface PinoLoggerOptions {
  /** Minimum level to emit. Defaults to `'info'`. */
  level?: PinoLogLevel;
  /** Static fields added to every log line. */
  bindings?: LogMeta;
  /**
   * Where to write logs.
   * - `'stdout'` (default): file descriptor 1.
   * - `'stderr'`: file descriptor 2 — required when running over stdio MCP
   *   transport so stdout stays clean for the protocol channel.
   */
  sink?: 'stdout' | 'stderr';
  /**
   * Override the underlying Pino instance entirely. Useful for tests, custom
   * transports (e.g. `@logtail/pino`), or pre-configured destinations.
   */
  pino?: PinoLogger;
  /**
   * Inject a destination stream — exposed mainly for tests.
   */
  destination?: DestinationStream;
}

const adaptPinoLogger = (instance: PinoLogger): Logger => ({
  trace: (msg, meta) => instance.trace(meta ?? {}, msg),
  debug: (msg, meta) => instance.debug(meta ?? {}, msg),
  info: (msg, meta) => instance.info(meta ?? {}, msg),
  warn: (msg, meta) => instance.warn(meta ?? {}, msg),
  error: (msg, meta) => instance.error(meta ?? {}, msg),
  child: (extra) => adaptPinoLogger(instance.child(extra)),
});

/**
 * Create a Pino-backed implementation of mcify's {@link Logger} interface.
 *
 * Pino emits structured JSON one line per log event, pipes cleanly into
 * BetterStack, Datadog, Loki, and any other JSON-aware aggregator.
 *
 * Note: Pino is **opt-in**. The default runtime logger is the lightweight
 * console-based one, which works on Cloudflare Workers (Pino does not).
 *
 * To pretty-print during dev, attach `pino-pretty` via Pino's transport:
 *
 * ```ts
 * import { pino } from 'pino';
 * import { createPinoLogger } from '@mcify/runtime';
 * const dev = pino({
 *   level: 'debug',
 *   transport: { target: 'pino-pretty', options: { colorize: true } },
 * });
 * createHttpHandler(config, { logger: createPinoLogger({ pino: dev }) });
 * ```
 */
export const createPinoLogger = (opts: PinoLoggerOptions = {}): Logger => {
  if (opts.pino) {
    return adaptPinoLogger(opts.pino);
  }

  const destination =
    opts.destination ??
    (opts.sink === 'stderr' ? pino.destination({ dest: 2, sync: true }) : undefined);

  const instance = pino(
    {
      level: opts.level ?? 'info',
      base: opts.bindings ?? null,
    },
    destination,
  );

  return adaptPinoLogger(instance);
};
