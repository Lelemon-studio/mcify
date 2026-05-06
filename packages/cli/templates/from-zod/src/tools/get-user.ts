import { defineTool } from '@mcify/core';
import { GetUserInput, User } from '../schemas.js';

export const getUser = defineTool({
  name: 'get_user',
  description: 'Look up a user by id.',
  input: GetUserInput,
  output: User,
  handler: async ({ userId }) => {
    // TODO: replace with a real call to your user service.
    return {
      id: userId,
      email: 'demo@example.com',
      fullName: 'Demo User',
      role: 'member' as const,
      createdAt: new Date().toISOString(),
    };
  },
});
