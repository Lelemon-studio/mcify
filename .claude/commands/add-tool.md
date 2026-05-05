---
description: Scaffold a new MCP tool with Zod schemas and a placeholder handler.
---

Scaffold a new MCP tool — either in an example connector or in the user's own project.

Required input from the user: the tool name (e.g., `khipu_create_payment`).

1. **Validate the name** against `/^[a-zA-Z0-9_-]{1,64}$/`. Reject if it doesn't match (this is the same regex `defineTool` enforces at runtime).

2. **Find the right home for the tool.** Ask the user only if it's not obvious:
   - In a `packages/examples/<connector>/` example: add to that connector's `tools/` directory.
   - In a user project: add to `tools/` next to `mcify.config.ts`.

3. **Write the tool file** as `<name>.ts`:

   ```ts
   import { defineTool, schema } from '@mcify/core';
   import { z } from 'zod';

   export const <camelName> = defineTool({
     name: '<name>',
     description: '<one sentence, present tense>',
     input: z.object({
       // schema.id(), schema.url(), schema.money(), etc. for common shapes
     }),
     output: z.object({
       // ...
     }),
     handler: async (input, ctx) => {
       throw new Error('not implemented');
     },
   });
   ```

   Suggest sensible Zod helpers from `@mcify/core`'s `schema` namespace where applicable (`schema.id`, `schema.url`, `schema.httpUrl`, `schema.money`, `schema.timestamp`, `schema.paginated`).

4. **Register it** in `mcify.config.ts`:

   ```ts
   import { <camelName> } from './tools/<name>.js';

   export default defineConfig({
     // ...
     tools: [<camelName>, /* ... existing ... */],
   });
   ```

5. **Add a basic test** as `tools/<name>.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { <camelName> } from './<name>.js';

   describe('<name>', () => {
     it('rejects invalid input', () => {
       const result = <camelName>.input.safeParse({});
       expect(result.success).toBe(false);
     });

     // Add a happy-path test once the handler is implemented.
   });
   ```

6. **Verify**: run `pnpm typecheck` and `pnpm test` for the affected package. Don't write the actual handler logic — the developer fills that in.

7. **Don't add a changeset** unless the tool ships in a published example. User-project tools never get changesets.
