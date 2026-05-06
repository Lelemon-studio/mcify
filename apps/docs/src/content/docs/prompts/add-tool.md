---
title: Add a tool to my server
description: Copy-paste prompt that walks Claude / Cursor through scaffolding a new mcify tool with the canonical pattern.
---

Use this when you have an existing mcify project and want to add one new tool that wraps an API endpoint or a local operation.

## Prompt

````markdown
You are helping me add a new tool to my mcify MCP server. Follow the
project's conventions exactly — don't invent shortcuts.

Read these docs first:

- https://docs.mcify.dev/llms-full.txt
- https://docs.mcify.dev/concepts/tools/
- https://docs.mcify.dev/guides/creating-effective-tools/
- https://docs.mcify.dev/guides/antipatterns/

What I want the tool to do:
<<<
REPLACE THIS BLOCK with a plain-language description of the API call
or operation you want exposed. Include:

- The upstream API URL and HTTP method (if any).
- The auth model upstream (API key in header? bearer? OAuth?).
- The shape of the input the agent will pass.
- The shape of what gets returned.
- Any side effects (sends an email, writes audit log, charges money).
  > > >

Now, end-to-end:

1. Pick a tool name — snake*case, prefixed by the service domain
   (`<service>*<verb>\_<noun>`).

2. Create `src/tools/<verb>-<noun>.ts` with `defineTool` from
   `@mcify/core`. Use the canonical structure:

   ```ts
   import { defineTool } from '@mcify/core';
   import { rateLimit, requireAuth, withTimeout } from '@mcify/core/middleware';
   import { z } from 'zod';

   export const <camelCaseName> = defineTool({
     name: '<service>_<verb>_<noun>',
     description: '<two sentences: what it does, when to use it>',
     middlewares: [
       requireAuth(),
       rateLimit({ max: <reasonable>, windowMs: 60_000 }),
       withTimeout({ ms: <reasonable> }),
     ],
     input: z.object({ /* fields with .describe() each */ }),
     output: z.object({ /* fields with .describe() each */ }),
     handler: async (input, ctx) => {
       const res = await ctx.fetch('<URL>', { /* ... */ });
       return /* parse to the output shape */;
     },
   });
   ```

3. Use `ctx.fetch` (NOT `globalThis.fetch`) so tests can swap it.

4. Wire the tool into `mcify.config.ts` — import + add to `tools[]`.
   Don't touch the rest of the config.

5. Add a unit test at `src/tools/<verb>-<noun>.test.ts` using
   `createTestClient` from `@mcify/runtime/test`. The test should mock
   `fetch` against a fixed JSON response and assert the returned
   object's shape, not the internal call sequence.

6. Run `pnpm typecheck && pnpm test && pnpm lint`. Fix anything that
   fails. Don't disable rules to make warnings go away.

Conventions to honor:

- Every input field gets a `.describe()` with format hints (e.g.
  "ISO 8601 in UTC", "amount in CLP, no decimals").
- Don't return `string`. Return a structured object.
- Errors should be actionable — include what the agent should do next
  (e.g. "Use users_list to find the right id").
- See https://docs.mcify.dev/guides/antipatterns/ before naming things.

When you're done, summarize:

- Tool name + signature (input → output).
- Where it goes in mcify.config.ts.
- The test command that should now pass.
````

## How to use it

1. Copy the entire block above (including the triple backticks if you're saving it as a slash command).
2. Replace the `<<<...>>>` block with your specific request.
3. Paste into Claude Code, Cursor, or Claude.ai chat.

For Claude Code, save it as `.claude/commands/add-mcp-tool.md` and trigger with `/add-mcp-tool` followed by your request.

## Example invocations

> Add a tool that calls `POST https://api.stripe.com/v1/customers` to create a Stripe customer. Auth is `Authorization: Bearer ${STRIPE_SECRET}`. Input is `email`, optional `name`, optional `phone`. Returns the new customer id and creation timestamp. Side effect: visible in the Stripe dashboard. Service prefix: `stripe`.

> Add a tool that reads from our local Postgres `SELECT * FROM users WHERE id = $1`. No upstream auth (uses the `pg` pool we already have on `ctx.deps`). Input is one UUID. Output: id, email, created_at. No side effects. Service prefix: `users`.

The prompt will produce different code for each, but with the same shape and the same middleware stack.
