import { z } from 'zod';

/**
 * Centralized Zod schemas. The pattern: define every shape your tools need
 * here, import where you call `defineTool`. Lets you reuse types across
 * tools and across tests, and gives a single grep target when the upstream
 * API changes.
 */

export const UserId = z.string().uuid().describe('User UUID');

export const UserRole = z.enum(['admin', 'member', 'viewer']);

export const User = z.object({
  id: UserId,
  email: z.string().email(),
  fullName: z.string().min(1).max(120),
  role: UserRole,
  createdAt: z.string().datetime(),
});

export const CreateUserInput = z.object({
  email: z.string().email().describe('Email — must be unique'),
  fullName: z.string().min(1).max(120),
  role: UserRole.default('member'),
});

export const GetUserInput = z.object({
  userId: UserId,
});

// Type exports — use these in handlers so the implementation stays
// in lockstep with the schema.
export type User = z.infer<typeof User>;
export type UserRole = z.infer<typeof UserRole>;
export type CreateUserInput = z.infer<typeof CreateUserInput>;
export type GetUserInput = z.infer<typeof GetUserInput>;
