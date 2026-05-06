---
title: Wrap an API as MCP
description: Copy-paste prompt for turning an existing REST/GraphQL API into a full mcify connector.
---

Use this when you have a service (yours or a third-party's) and want a complete MCP connector — multiple tools, an auth model, tests, and a deploy story — not just a single tool.

## Prompt

````markdown
You are building a full mcify MCP connector that wraps an existing API.
Follow project conventions; don't invent shortcuts.

Read these docs first:

- https://docs.mcify.dev/llms-full.txt
- https://docs.mcify.dev/concepts/tools/
- https://docs.mcify.dev/concepts/auth/
- https://docs.mcify.dev/guides/creating-effective-tools/
- https://docs.mcify.dev/guides/antipatterns/

The API I want to wrap:
<<<
REPLACE this with:

- API name + a one-line description.
- Base URL.
- Auth: header name and shape (API key? bearer?) + how a user gets it.
- The 3–7 endpoints I want exposed as MCP tools, with method, path, and a
  one-line summary each.
- Any URL or filename for an OpenAPI spec, if you have one.
  > > >

Plan, then execute:

1. **Plan the connector layout.** Output a short tree like this:

   ```
   packages/example-<service>/
   ├── src/
   │   ├── client.ts
   │   ├── client.test.ts
   │   └── tools/
   │       ├── <verb>-<noun>.ts
   │       └── ...
   ├── mcify.config.ts
   ├── package.json
   ├── tsconfig.json
   └── README.md
   ```

   Confirm with me before writing files.

2. **`src/client.ts`** — a small typed REST wrapper.
   - Class `<Service>Client` with a constructor that accepts
     `{ apiKey, baseUrl?, fetch? }`.
   - One typed method per tool you'll expose.
   - A `<Service>ApiError` class extending `Error` with `status` and `body`.
   - Use the spread-conditional pattern for optional fields, NOT
     `if (x) obj.x = ...`.
   - Inject `fetch` so tests can mock.
   - No SDK dependency — keep the bundle tight.

3. **`src/client.test.ts`** — vitest with `fetch` mocked via
   `vi.fn().mockImplementation(() => Promise.resolve(ok(...)))`.
   - Use `mockImplementation`, NOT `mockResolvedValue`, because
     Response.text() can only be read once and tests reuse the mock
     across calls.
   - Cover happy path and the error wrapper for each method.

4. **One file per tool in `src/tools/`** — `defineTool` with:
   - Snake-case name prefixed by the service.
   - Description: "what it does. when to use it."
   - Middlewares: `requireAuth`, `rateLimit` (lower for writes,
     higher for reads), `withTimeout` (5–15s).
   - Per-field `.describe()` on every input.
   - Output: structured object (no `z.string()` outputs).

5. **`mcify.config.ts`** — `defineConfig` wiring all tools, with
   `auth: bearer({ env: 'MCIFY_AUTH_TOKEN' })`. The upstream API key
   stays on the server (`<SERVICE>_API_KEY` env), the bearer token
   gates the agent.

6. **`package.json`** — `@mcify/core` as a dependency, `@mcify/runtime`
   in devDependencies, `zod` as a dependency, `private: true`. Scripts:
   `build`, `dev`, `test`, `typecheck`, `clean`.

7. **`tsconfig.json`** — extends `../../../tsconfig.base.json`, includes
   `src/**/*` and `mcify.config.ts`, excludes `**/*.test.ts`.

8. **`README.md`** — bilingual is bonus (EN + `README.es.md` if it's a
   LATAM API). Include:
   - What the connector does + table of tools.
   - "Run locally" with env vars.
   - "Connect from Claude Desktop" snippet.
   - Disclaimer that the connector isn't affiliated with the upstream.

Conventions to honor:

- TypeScript strict, ES modules, Node ≥ 20.
- No silent catches. Wrap errors with context.
- Don't disable lint rules. Fix the underlying code.
- `pnpm typecheck && pnpm test && pnpm lint` must pass.

When done, summarize:

- The path to the new package.
- The list of tools you exposed.
- The `pnpm install` + `pnpm dev` commands the user needs to run.
````

## How to use

Pick one of these starting points and replace the `<<<...>>>` block:

**You have an OpenAPI spec.** Skip this prompt and use the [from-openapi generator](/guides/from-openapi/) instead — it produces the same shape automatically. Come back to this prompt only if you want to hand-tune the descriptions afterward.

**You don't have a spec, just docs.** Paste the API's URL, the auth model, and a list of "I want a tool that does X" lines. The assistant will read the API docs, design the connector, and execute step by step.

**You want a quick spike.** Tell it: "Skip step 8 (README), focus on getting tools 1, 3, and 5 from the list above working end-to-end." It'll narrow scope.

## Example

> The API I want to wrap: Resend (transactional email, https://resend.com/docs).
>
> - Base URL: `https://api.resend.com`
> - Auth: `Authorization: Bearer ${RESEND_API_KEY}`. Get it from the Resend dashboard.
> - Endpoints I want:
>   - `POST /emails` → `resend_send_email`
>   - `GET /emails/:id` → `resend_get_email`
>   - `POST /domains` → `resend_create_domain`
>   - `GET /domains` → `resend_list_domains`
>
> Service prefix: `resend`.

The assistant outputs the full connector — client, tests, four tools, config, README — following the structure above.
