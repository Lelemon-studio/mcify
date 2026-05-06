---
title: '@mcify/core'
description: defineTool / Resource / Prompt / Config builders + auth helpers + middleware.
---

The `@mcify/core` package exposes builders, type definitions, auth helpers, schema helpers, and the middleware used by the runtime. It has zero runtime dependencies beyond Zod and the JSON-Schema converter.

## Builders

### `defineTool(spec)`

```ts
import { defineTool } from '@mcify/core';

defineTool({
  name: string,
  description: string,
  middlewares?: Middleware[],
  input: ZodSchema,
  output: ZodSchema,
  handler: (input, ctx) => Promise<output>,
});
```

Returns an opaque `Tool` object. Pass arrays of these to `defineConfig({ tools: [...] })`. See [Concepts → Tools](/concepts/tools/).

### `defineResource(spec)`

```ts
defineResource({
  uri: string,           // 'config://current' or 'user://{userId}'
  name: string,
  description?: string,
  mimeType?: string,
  isTemplate?: boolean,  // inferred from URI; pass to override
  paramsSchema?: ZodSchema,  // for templated URIs
  read: (params?) => Promise<{ contents: ContentBlock[] }>,
});
```

### `definePrompt(spec)`

```ts
definePrompt({
  name: string,
  description: string,
  argumentsSchema?: ZodSchema,
  render: (args) => Promise<{ messages: Message[] }>,
});
```

### `defineConfig(spec)`

```ts
defineConfig({
  name: string,
  version: string,
  description?: string,
  auth?: AuthConfig,
  tools?: Tool[],
  resources?: Resource[],
  prompts?: Prompt[],
  middlewares?: Middleware[],   // global; runs before per-tool middleware
  eventBus?: EventBus,
  logger?: Logger,
});
```

This is the default export of every `mcify.config.ts`.

## Auth helpers

```ts
import { auth, bearer, apiKey, oauth } from '@mcify/core';

auth.none()                                          // no auth (dev only)
bearer({ env: 'MCIFY_AUTH_TOKEN' })                  // env-based
bearer({ verify: async (t) => ... })                 // custom check
apiKey({ headerName: 'x-api-key', env: 'MY_KEY' })   // API key in header
oauth({ provider: 'workos', audience: '...' })       // JWT validation
```

See [Concepts → Auth](/concepts/auth/) for full details.

## Middleware

```ts
import { requireAuth, rateLimit, withTimeout, composeMiddlewares } from '@mcify/core/middleware';
```

| Middleware                             | Args                                                |
| -------------------------------------- | --------------------------------------------------- |
| `requireAuth({ message?, check? })`    | Optional message + scope predicate.                 |
| `rateLimit({ max, windowMs, keyBy? })` | Bucket size, window, optional custom key extractor. |
| `withTimeout({ ms })`                  | Deadline in ms. Aborts via `ctx.signal`.            |
| `composeMiddlewares(stack)`            | Flattens an array into a single middleware.         |

See [Concepts → Middleware](/concepts/middleware/).

## Schema helpers

```ts
import { schema } from '@mcify/core';

schema.id(64)                                        // .string().min(1).max(64)
schema.url()                                         // .string().url()
schema.httpUrl()                                     // .string().url() with http(s) regex guard
schema.timestamp()                                   // .string().datetime()
schema.money({ minor?: boolean })                    // amount + currency object
schema.paginated(itemSchema)                         // { items, nextCursor?, totalApprox? }
```

Use these instead of re-implementing common shapes. They round-trip through JSON Schema cleanly so the agent sees the format hints.

## Errors

```ts
import { McifyValidationError } from '@mcify/core';
```

Thrown by the runtime when input or output validation fails. Has `phase: 'input' | 'output'`, `issues: ZodIssue[]`, and a human-readable `message`. Tools should not throw this directly — the runtime does it for you.

## Type exports

```ts
import type {
  Tool,
  ToolDefinition,
  Resource,
  ResourceDefinition,
  ResourceTemplate,
  Prompt,
  PromptDefinition,
  Config,
  AnyTool,
  HandlerContext,
  Logger,
  LogMeta,
  AuthState,
  RequestMeta,
  AuthConfig,
  BearerOptions,
  ApiKeyOptions,
  OAuthOptions,
  Middleware,
  ValidationPhase,
} from '@mcify/core';
```

The types are stable across alpha; field additions are minor bumps, breaking changes are major.
