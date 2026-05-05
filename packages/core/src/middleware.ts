import type { HandlerContext, AuthState } from './context.js';

/**
 * A middleware wraps a tool's handler. Middlewares run in declaration order;
 * each one calls `next()` to pass control to the following middleware (or the
 * handler when it's the last one).
 *
 * Patterns:
 *   - Short-circuit: don't call `next()`, return early. (e.g. `requireAuth`
 *     when the auth check fails.)
 *   - Decorate: call `next()`, transform its result before returning.
 *     (e.g. `cache` writing to a store.)
 *   - Override input: call `next(differentInput)` to alter what the next
 *     stage sees. (e.g. `normalize` lowercasing email fields.)
 *
 * Middlewares run *after* input validation and *before* output validation.
 */
export type ToolMiddleware = (
  input: unknown,
  ctx: HandlerContext,
  next: (input?: unknown) => Promise<unknown>,
) => Promise<unknown>;

/**
 * Compose an ordered chain of middlewares around a final handler. The handler
 * receives the input the last middleware passed through `next()` (which may
 * differ from the original after transformations).
 *
 * Internal — used by `defineTool`. Exported so library authors can re-use
 * the composition machinery if they're building higher-level abstractions.
 */
export const composeMiddlewares = (
  middlewares: readonly ToolMiddleware[],
  handler: (input: unknown, ctx: HandlerContext) => Promise<unknown>,
): ((input: unknown, ctx: HandlerContext) => Promise<unknown>) => {
  if (middlewares.length === 0) return handler;

  // Sentinel for distinguishing `next()` (use current input) from
  // `next(undefined)` (override with `undefined`). Arrow functions don't have
  // their own `arguments` object, so we encode "no override" as a unique value.
  const NO_OVERRIDE: unique symbol = Symbol('mcify.middleware.noOverride');
  type NoOverride = typeof NO_OVERRIDE;

  return async (input, ctx) => {
    const dispatch = (i: number, currentInput: unknown): Promise<unknown> => {
      if (i >= middlewares.length) return handler(currentInput, ctx);
      const mw = middlewares[i];
      if (!mw) return handler(currentInput, ctx);
      let called = false;
      const next = (override: unknown | NoOverride = NO_OVERRIDE): Promise<unknown> => {
        if (called) {
          throw new Error(
            'mcify middleware: next() called more than once. Each middleware must call next() at most once.',
          );
        }
        called = true;
        const nextInput = override === NO_OVERRIDE ? currentInput : override;
        return dispatch(i + 1, nextInput);
      };
      return mw(currentInput, ctx, next as (input?: unknown) => Promise<unknown>);
    };
    return dispatch(0, input);
  };
};

// ---------- Built-in middlewares ----------

export interface RequireAuthOptions {
  /**
   * Custom predicate for fine-grained authorization. Receives the resolved
   * {@link AuthState}; return `true` to allow, `false` to reject.
   * Default predicate: any authenticated state (`type !== 'none'`) passes.
   */
  predicate?: (auth: AuthState) => boolean;
  /** Error message thrown on rejection. Defaults to `"unauthorized"`. */
  message?: string;
}

/**
 * Reject the call when the request isn't authenticated (or fails a custom
 * predicate). Throws an `Error` that the runtime translates to an MCP tool
 * error response.
 */
export const requireAuth = (options: RequireAuthOptions = {}): ToolMiddleware => {
  const predicate = options.predicate ?? ((auth) => auth.type !== 'none');
  const message = options.message ?? 'unauthorized';
  return async (input, ctx, next) => {
    if (!predicate(ctx.auth)) {
      throw new Error(message);
    }
    return next();
  };
};

export interface RateLimitOptions {
  /** Max requests per window per key. */
  max: number;
  /** Window duration in milliseconds. */
  windowMs: number;
  /**
   * Extracts the bucket key from the context. Default behavior:
   *   - `bearer` → the token,
   *   - `api_key` → the key value,
   *   - `oauth` → the token,
   *   - `none` → `null` (no limiting; the dev should compose with `requireAuth`
   *     if anonymous calls aren't allowed).
   */
  keyBy?: (ctx: HandlerContext) => string | null;
  /** Error message thrown when the limit is exceeded. */
  message?: string;
}

const defaultKeyBy = (ctx: HandlerContext): string | null => {
  switch (ctx.auth.type) {
    case 'bearer':
      return ctx.auth.token;
    case 'api_key':
      return ctx.auth.key;
    case 'oauth':
      return ctx.auth.token;
    default:
      return null;
  }
};

/**
 * In-memory token bucket rate limiter. Keys are derived from the auth state
 * by default; pass `keyBy` to scope by something else.
 *
 * Caveat: state lives in the process, so it doesn't survive restarts and
 * doesn't span multiple instances. For Cloudflare Workers, use a Durable
 * Object-backed implementation; for clusters, a Redis-backed one. The Node
 * single-process default covers `mcify dev` and small production deploys.
 */
export const rateLimit = (options: RateLimitOptions): ToolMiddleware => {
  const { max, windowMs } = options;
  const keyBy = options.keyBy ?? defaultKeyBy;
  const message = options.message ?? `rate limit exceeded (${max} per ${windowMs}ms)`;
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return async (input, ctx, next) => {
    const key = keyBy(ctx);
    if (key === null) return next();

    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
    } else if (bucket.count >= max) {
      throw new Error(message);
    } else {
      bucket.count += 1;
    }
    return next();
  };
};

export interface WithTimeoutOptions {
  /** Hard deadline in milliseconds. */
  ms: number;
  /** Error message thrown on timeout. */
  message?: string;
}

/**
 * Reject if the downstream chain doesn't resolve within `ms`. Doesn't *cancel*
 * the underlying handler (Node has no general cancellation primitive); the
 * handler keeps running in the background. The handler should consult
 * `ctx.signal` to stop early — this middleware aborts that signal on timeout.
 */
export const withTimeout = (options: WithTimeoutOptions): ToolMiddleware => {
  const message = options.message ?? `timeout after ${options.ms}ms`;
  return async (input, ctx, next) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), options.ms);
    });
    try {
      return await Promise.race([next(), timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
};
