---
title: Resources
description: Read-only data addressed by URI. Static or templated.
---

A resource is something the agent reads (not invokes). Each one is identified by a URI — opaque to the agent, structured to your server.

```ts
import { defineResource } from '@mcify/core';

export const config = defineResource({
  uri: 'config://current',
  name: 'Server config',
  description: 'The mcify server config in JSON form',
  mimeType: 'application/json',
  read: async () => ({
    contents: [
      { uri: 'config://current', text: JSON.stringify({ name: 'weather', version: '0.1.0' }) },
    ],
  }),
});
```

Wire it the same way as a tool:

```ts
defineConfig({ resources: [config], ... });
```

The agent calls `resources/list` to discover them, then `resources/read` with a URI.

## Templated resources

URIs can be templated. The runtime extracts path parameters and passes them to your handler:

```ts
export const userProfile = defineResource({
  uri: 'user://{userId}',
  name: 'User profile',
  read: async (params) => {
    // params.userId — typed via the schema below
    const user = await fetchUser(params.userId);
    return {
      contents: [{ uri: `user://${params.userId}`, text: JSON.stringify(user) }],
    };
  },
  paramsSchema: z.object({ userId: z.string().uuid() }),
});
```

When the agent calls `resources/read` with `user://550e8400-e29b-41d4-a716-446655440000`, the runtime pattern-matches against `user://{userId}`, validates with `paramsSchema`, and invokes `read({ userId: '550e...' })`.

## Resource vs tool

| Use a resource                                  | Use a tool                                   |
| ----------------------------------------------- | -------------------------------------------- |
| Read-only. Idempotent.                          | Causes side effects. Writes, sends, charges. |
| The agent wants to _see_ something.             | The agent wants to _do_ something.           |
| Result is large enough that pagination matters. | Result fits in a JSON object.                |

Most connectors lean tool-heavy. Resources are useful for read-only catalog APIs (a list of products, a knowledge base article, a config dump).

## Next

- [Prompts](/concepts/prompts/)
- [Tools](/concepts/tools/) — the more common case.
