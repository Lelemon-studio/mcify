import { describe, it, expect } from 'vitest';
import pino from 'pino';
import { createPinoLogger } from './logger-pino.js';

const captureStream = (): { lines: string[]; stream: { write: (s: string) => void } } => {
  const lines: string[] = [];
  return {
    lines,
    stream: {
      write: (chunk: string) => {
        lines.push(chunk);
      },
    },
  };
};

describe('createPinoLogger', () => {
  it('emits structured JSON lines', () => {
    const sink = captureStream();
    const instance = pino({ level: 'info' }, sink.stream);
    const logger = createPinoLogger({ pino: instance });

    logger.info('hello world', { reqId: 'req-1' });

    expect(sink.lines).toHaveLength(1);
    const parsed = JSON.parse(sink.lines[0]!) as Record<string, unknown>;
    expect(parsed['msg']).toBe('hello world');
    expect(parsed['reqId']).toBe('req-1');
    expect(parsed['level']).toBe(30); // info level in pino
  });

  it('respects level filtering', () => {
    const sink = captureStream();
    const instance = pino({ level: 'warn' }, sink.stream);
    const logger = createPinoLogger({ pino: instance });

    logger.debug('not emitted');
    logger.info('not emitted');
    logger.warn('emitted');

    expect(sink.lines).toHaveLength(1);
    expect(JSON.parse(sink.lines[0]!)['msg']).toBe('emitted');
  });

  it('child() merges bindings', () => {
    const sink = captureStream();
    const instance = pino({ level: 'info' }, sink.stream);
    const logger = createPinoLogger({ pino: instance });

    const child = logger.child({ scope: 'auth' });
    child.info('verified', { userId: 42 });

    const parsed = JSON.parse(sink.lines[0]!) as Record<string, unknown>;
    expect(parsed['scope']).toBe('auth');
    expect(parsed['userId']).toBe(42);
    expect(parsed['msg']).toBe('verified');
  });

  it('all five levels dispatch correctly', () => {
    const sink = captureStream();
    const instance = pino({ level: 'trace' }, sink.stream);
    const logger = createPinoLogger({ pino: instance });

    logger.trace('t');
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    const levels = sink.lines.map(
      (line) => (JSON.parse(line) as { level: number }).level,
    );
    // pino numeric: trace=10, debug=20, info=30, warn=40, error=50
    expect(levels).toEqual([10, 20, 30, 40, 50]);
  });

  it('honors static bindings on the root logger', () => {
    const sink = captureStream();
    const instance = pino({ level: 'info', base: { service: 'mcify' } }, sink.stream);
    const logger = createPinoLogger({ pino: instance });

    logger.info('hello');

    const parsed = JSON.parse(sink.lines[0]!) as Record<string, unknown>;
    expect(parsed['service']).toBe('mcify');
  });

  it('builds a default Pino instance when none is provided', () => {
    const sink = captureStream();
    const logger = createPinoLogger({
      level: 'info',
      bindings: { server: 'demo' },
      destination: sink.stream,
    });

    logger.info('boot');

    const parsed = JSON.parse(sink.lines[0]!) as Record<string, unknown>;
    expect(parsed['server']).toBe('demo');
    expect(parsed['msg']).toBe('boot');
  });
});
