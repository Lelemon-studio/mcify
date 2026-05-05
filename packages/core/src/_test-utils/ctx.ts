import type { HandlerContext, Logger } from '../context.js';

const makeNoopLogger = (): Logger => {
  const logger: Logger = {
    trace: () => undefined,
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    child: () => logger,
  };
  return logger;
};

export const noopLogger = makeNoopLogger();

let counter = 0;

export const createTestCtx = (overrides: Partial<HandlerContext> = {}): HandlerContext => {
  counter += 1;
  return {
    logger: noopLogger,
    fetch: globalThis.fetch,
    auth: { type: 'none' },
    signal: new AbortController().signal,
    request: { id: `test-${counter}`, receivedAt: new Date() },
    ...overrides,
  };
};
