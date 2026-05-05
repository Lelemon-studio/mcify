import type { z } from 'zod';

export type ValidationPhase = 'input' | 'output' | 'arguments' | 'params';

export class McifyValidationError extends Error {
  override readonly name = 'McifyValidationError';

  constructor(
    public readonly phase: ValidationPhase,
    public readonly issues: readonly z.ZodIssue[],
  ) {
    const summary = issues
      .map((i) => `${i.path.length === 0 ? '<root>' : i.path.join('.')}: ${i.message}`)
      .join('; ');
    super(`${phase} validation failed: ${summary}`);
  }
}
