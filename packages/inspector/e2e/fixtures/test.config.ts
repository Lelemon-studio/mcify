import { auth, defineConfig, defineTool } from '@mcify/core';
import { z } from 'zod';

/**
 * Lightweight mcify config used by the Playwright E2E suite. Two tools that
 * exercise both happy and error paths without needing any external network.
 */

const greet = defineTool({
  name: 'greet',
  description: 'Say hello to someone by name',
  input: z.object({ name: z.string().min(1).max(100) }),
  output: z.object({ message: z.string() }),
  handler: ({ name }) => ({ message: `Hello, ${name}!` }),
});

const fail = defineTool({
  name: 'always_fails',
  description: 'Always throws to exercise the error path',
  input: z.object({}),
  output: z.object({}),
  handler: () => {
    throw new Error('intentional test failure');
  },
});

export default defineConfig({
  name: 'e2e-fixture',
  version: '0.1.0',
  description: 'Fixture server for the inspector E2E suite',
  // Inspector calls go through the test client path (no auth header), and
  // the runtime accepts that with `auth.none()`.
  auth: auth.none(),
  tools: [greet, fail],
});
