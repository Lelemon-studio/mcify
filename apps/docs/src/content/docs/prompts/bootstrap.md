---
title: Bootstrap from zero
description: One prompt. Paste into Claude Code / Cursor / Windsurf. The assistant installs mcify, scaffolds the project, and walks you through building your first tool.
---

This is the **single prompt** to start an mcify project from scratch. Paste it into your AI assistant; it runs the install, sets up the project, reads the docs, and waits for you to describe the first tool. You don't open a terminal — the assistant does.

Works in: **Claude Code**, **Cursor (agent mode)**, **Windsurf**, **Copilot Workspace**.

## The prompt

````markdown
You are bootstrapping a new mcify MCP server end-to-end. Run every step
autonomously; only stop to ask me when you genuinely need input I haven't
given you. Don't ask for permission to run shell commands or edit files —
I'm asking you to do this work.

Read these docs first to ground your knowledge before doing anything:

- https://docs.mcify.dev/llms-full.txt

What I want you to build:
<<<
REPLACE THIS BLOCK with two lines:

1. Project name (e.g. "stripe-mcp", "my-internal-api"). One slug, no
   spaces.
2. The first thing you want the server to do, in plain language. E.g.
   "wrap https://api.stripe.com/v1/customers to expose a tool that
   creates a Stripe customer; auth is bearer with the STRIPE_SECRET
   env var".
   > > >

Run these steps in order. Don't skip ahead.

1. **Detect the package manager.**
   - If `pnpm-lock.yaml` exists in the parent directory: pnpm.
   - Else if `yarn.lock` exists: yarn.
   - Else: npm.
     Use the detected one for every command below.

2. **Scaffold.**
   - Run: `npx @mcify/cli@alpha init <project-name>`
   - cd into the new directory.
   - Install with the detected package manager:
     - pnpm → `pnpm install`
     - yarn → `yarn`
     - npm → `npm install`

3. **Smoke check.**
   - Run the build to confirm everything compiles:
     - `pnpm build` / `yarn build` / `npm run build`
   - If it fails, surface the error and fix it before moving on.
     Do NOT delete files or downgrade deps without asking.

4. **Set the bearer token.**
   - Generate a token: `openssl rand -hex 32` (or use Node's
     `crypto.randomBytes(32).toString('hex')` if openssl isn't
     installed).
   - Write a `.env.local` (and add to `.gitignore` if not already)
     with:
     ```
     MCIFY_AUTH_TOKEN=<the-token>
     ```
   - The token gates the agent against the MCP server. You'll wire
     real upstream credentials per-tool below.

5. **Add the first tool.** Treat my "first thing the server should do"
   from the block above as the spec.
   - Pick a tool name: snake_case, prefixed by the service domain
     (e.g. `stripe_create_customer`, not `createCustomer`).
   - Create `src/tools/<verb>-<noun>.ts` using the canonical pattern:

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
       input: z.object({
         /* every field gets .describe() with format hints */
       }),
       output: z.object({
         /* structured object — never z.string() */
       }),
       handler: async (input, ctx) => {
         const res = await ctx.fetch('<URL>', { /* ... */ });
         return /* parse to the output shape */;
       },
     });
     ```

   - Use `ctx.fetch`, NOT `globalThis.fetch`. Tests need the
     injection point.
   - Every input field gets a `.describe()` with format hints. See
     https://docs.mcify.dev/guides/creating-effective-tools/.
   - Pick reasonable rateLimit + timeout values — see the table at
     https://docs.mcify.dev/guides/creating-effective-tools/#middleware-defaults-that-scale.

6. **Wire the tool into `mcify.config.ts`.**
   - Import the tool. Add it to `tools[]`.
   - Don't change anything else in the config — auth, name, version
     stay as scaffolded.

7. **Add the upstream credential.**
   - Add the upstream API key env var name to `.env.local` (e.g.
     `STRIPE_SECRET_KEY=...`).
   - Tell me what name you used so I know what to set.

8. **Test the tool.**
   - Generate a vitest unit test at `src/tools/<verb>-<noun>.test.ts`
     using `createTestClient` from `@mcify/runtime/test`. Mock
     `fetch` with `vi.fn().mockImplementation(() => Promise.resolve(...))`
     — NOT `mockResolvedValue` (Response.text() can only be read
     once across calls).
   - Run: `pnpm test` / `yarn test` / `npm test`. Make sure it
     passes.

9. **Run the dev server.**
   - Run: `pnpm dev` / `yarn dev` / `npm run dev` in a non-blocking
     way (background it if your shell supports it).
   - Confirm:
     - MCP endpoint at http://localhost:8888/mcp
     - Inspector at http://localhost:3001
   - Open the inspector URL in my browser if you can; otherwise
     just print it.

10. **Final report.** Print a summary that includes:
    - Project name and path.
    - Tool name and signature (input → output).
    - The two env vars I need (MCIFY_AUTH_TOKEN +
      <UPSTREAM>\_API_KEY) — names only, not values.
    - The exact MCP URL + bearer header to register in
      Claude Desktop / Cursor.
    - The next thing I should try (e.g. "open
      http://localhost:3001, switch to Playground, invoke the
      tool with { ... }").

Conventions to honor throughout:

- TypeScript strict, ES modules, Node ≥ 20.
- No silent catch blocks.
- No `console.log` for committed code — use `ctx.logger.info(...)`.
- Errors should be actionable: tell the agent what to do next.
- Don't disable lint rules to make warnings go away. Fix the
  underlying code.
- See https://docs.mcify.dev/guides/antipatterns/ before naming
  things or shaping the schema.

When you're done, the project should:

- Type-check.
- Lint clean.
- Have at least one passing test.
- Be running locally with the inspector reachable.
````

## How to use it

1. **Copy** the block above (everything between the triple backticks).
2. **Replace the `<<<...>>>` block** with two lines:
   - Project name (one slug)
   - What the server should do, in plain language
3. **Paste into your assistant** of choice:
   - **Claude Code**: paste in chat, it executes.
   - **Cursor**: switch to **Agent mode**, paste, run.
   - **Windsurf**: paste in Cascade, hit run.
   - **Claude Desktop**: paste in chat, but you'll have to copy/paste each command back into your terminal — it can't run shell directly.

4. **Wait.** The assistant runs ~10 commands, edits ~5 files, runs the test, starts the dev server. Time: 2–5 minutes depending on network.

5. **Set the upstream API key** when it tells you which env var name it picked. Then re-run dev.

## Save it as a slash command

Drop the prompt block into your dotfiles so it's available across projects:

```bash
# Claude Code (project-level)
mkdir -p .claude/commands
curl -o .claude/commands/bootstrap-mcify.md https://docs.mcify.dev/prompts/bootstrap.md.txt

# Then in Claude Code: /bootstrap-mcify
```

```bash
# Cursor (.cursor/rules/)
mkdir -p .cursor/rules
curl -o .cursor/rules/bootstrap-mcify.md https://docs.mcify.dev/prompts/bootstrap.md.txt
```

The `.md.txt` URL serves the prompt body without the surrounding docs chrome.

## Why this works (and where it can fail)

**Why it works:** the prompt anchors the model to `llms-full.txt` _before_ doing any work, so it generates correct mcify code on the first try (not what its training data thinks mcify looks like). Every concrete tradeoff (rate-limit values, timeout values, schema strictness) is delegated to the docs the model just read.

**Where it can fail:**

- **No `npx`/`pnpm`/`yarn`/`npm` on the host.** The assistant prints "I can't run shell" — paste the commands manually in your terminal. The rest of the prompt still works.
- **Upstream API needs a complex auth flow** (OAuth, mTLS). The assistant hits step 7 and asks. Answer with the flow; it adapts.
- **You want a different middleware stack.** Edit step 5 to remove or replace the middleware list.
- **Your project uses something other than vitest.** Edit step 8.

If the run gets stuck, paste the [Debug a misbehaving tool](/prompts/debug-tool/) prompt to recover.

## Related

- [Add a tool to my server](/prompts/add-tool/) — once bootstrapped, this is how you grow the server.
- [Wrap an existing API](/prompts/wrap-api/) — if your "first thing" is "wrap N endpoints", use that prompt instead.
- [How to use these prompts](/prompts/how-to-use/) — the meta-page about copy-paste prompts.
