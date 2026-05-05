import type { AuthState, HandlerContext, Logger } from '@mcify/core';
import { createConsoleLogger } from './logger.js';

export interface BuildContextOptions {
  logger?: Logger;
  auth?: AuthState;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  requestId?: string;
}

let counter = 0;
const generateRequestId = (): string => {
  counter += 1;
  return `req-${Date.now().toString(36)}-${counter.toString(36)}`;
};

export const buildHandlerContext = (opts: BuildContextOptions = {}): HandlerContext => ({
  logger: opts.logger ?? createConsoleLogger(),
  fetch: opts.fetchImpl ?? globalThis.fetch,
  auth: opts.auth ?? { type: 'none' },
  signal: opts.signal ?? new AbortController().signal,
  request: {
    id: opts.requestId ?? generateRequestId(),
    receivedAt: new Date(),
  },
});
