---
title: Migrate to multi-spec
description: Add N microservices behind a single MCP server using the from-openapi generator.
---

Use this when you already have one mcify server and want to fold in additional services (microservices, vendor APIs, internal tools) without spinning up another MCP server per service.

## Prompt

````markdown
You are migrating my single-service mcify server into a multi-spec
setup that combines several APIs behind one MCP endpoint.

Read these docs first:

- https://docs.mcify.dev/llms-full.txt
- https://docs.mcify.dev/guides/from-openapi/
- https://docs.mcify.dev/guides/creating-effective-tools/

The new services I want behind the same MCP server:
<<<
REPLACE this with one entry per service:

- Prefix (becomes the tool name prefix, e.g. "users", "billing").
- OpenAPI spec source (URL or local path).
- Auth model (bearer / API key in header / API key in query / none).
- Any operations to skip (sometimes you don't want every endpoint).
  > > >

Execute:

1. **Run the generator** for each spec:

   ```bash
   pnpm exec mcify generate from-openapi \
     --spec <prefix1>=<source1> \
     --spec <prefix2>=<source2>
   ```

   That writes `src/generated/<prefix>.ts` per service with all the
   `defineTool` calls.

2. **Wire each generated bundle into `mcify.config.ts`.** For every
   spec, import its `<prefix>_tools` factory and its
   `create_<prefix>_client`, then mix into `tools[]`:

   ```ts
   import { users_tools, create_users_client } from './src/generated/users.js';
   import { billing_tools, create_billing_client } from './src/generated/billing.js';

   const usersClient = create_users_client({ token: process.env.USERS_API_TOKEN });
   const billingClient = create_billing_client({ token: process.env.BILLING_API_TOKEN });

   export default defineConfig({
     name: 'my-aggregator',
     version: '0.1.0',
     auth: bearer({ env: 'MCIFY_AUTH_TOKEN' }),
     tools: [...existingTools, ...users_tools(usersClient), ...billing_tools(billingClient)],
   });
   ```

3. **Audit the generated tool descriptions.** The generator copies the
   OpenAPI `summary` + `description`. If those upstream descriptions
   are vague, edit them — agents will read them. The generator wrote
   normal `defineTool` calls, so you can hand-edit any of them.

4. **Add per-service env vars to your deploy.** Each `create_<prefix>_client`
   takes a `token`. Wire each one to its env var:
   - Cloudflare Workers: `wrangler secret put USERS_API_TOKEN`
   - Fly: `flyctl secrets set USERS_API_TOKEN=...`
   - Railway: `railway variables set USERS_API_TOKEN=...`
   - Docker: `-e USERS_API_TOKEN=...`

5. **Restart `mcify dev`** to pick up the new tools. Open the inspector;
   the Tools tab now shows the unified catalog with prefixed names
   (`users_*`, `billing_*`, plus your existing tools).

6. **Test from the inspector's Chat tab.** Ask the model to do something
   that requires combining services ("list the user with email X and
   then find their open invoices"). It should chain calls across the
   prefixes.

7. **Update CI / deploy config.**
   - The generated files go in git (you can commit them; they're
     deterministic).
   - Add a `pnpm exec mcify generate from-openapi ...` step to your
     CI if you want fresh tools on every spec change.
   - Re-run `pnpm typecheck` and `pnpm test` — both should still pass.

Conventions to honor:

- Don't disable lint rules in generated files.
- Don't manually edit `src/generated/*.ts` — re-run the generator
  instead. If the generator output is wrong, fix the source spec or
  the generator (PR welcome).
- Keep upstream API tokens in env vars, not in source.

When done, summarize:

- The list of tools now exposed (per prefix).
- The env vars the deployed instance needs.
- Whether any operations were skipped and why.
````

## When this is the right move

- You're running 2+ MCP servers and the agent has to register each separately. Consolidating saves config + auth surface area.
- A team owns multiple internal services and you want one tool catalog per team, not per service.
- You want to ship a single deployable artifact (one Cloudflare Worker, one Fly app) instead of N.

## When _not_ to consolidate

- The services have wildly different SLAs (one is 200ms, one is 5s). Mixing them means the slow service drags down concurrency for the fast one.
- The auth models conflict (one needs a per-user link token, the other is a static org key). Keep separate.
- The services are owned by different teams with separate deploy cadences. Coupling their MCP surface area makes one team's outage block the other.

If any of those apply, run multiple mcify servers and let the agent register both.
