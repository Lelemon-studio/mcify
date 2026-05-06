import { defineTool } from '@mcify/core';
import { CreateUserInput, User } from '../schemas.js';

export const createUser = defineTool({
  name: 'create_user',
  description: 'Create a user. Returns the persisted record.',
  input: CreateUserInput,
  output: User,
  handler: async (input) => {
    // TODO: replace with a real call to your user service.
    // Example:
    //   const res = await fetch(`${process.env.USERS_API}/users`, {
    //     method: 'POST',
    //     headers: { 'content-type': 'application/json' },
    //     body: JSON.stringify(input),
    //   });
    //   return User.parse(await res.json());
    return {
      id: crypto.randomUUID(),
      email: input.email,
      fullName: input.fullName,
      role: input.role,
      createdAt: new Date().toISOString(),
    };
  },
});
