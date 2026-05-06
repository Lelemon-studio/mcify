---
title: Schema helpers
description: Pre-built Zod patterns for IDs, URLs, money, timestamps, and pagination.
---

The `schema` namespace from `@mcify/core` provides Zod patterns for shapes you'll repeat across tools. They round-trip cleanly through JSON Schema so the agent picks up the format hints.

```ts
import { schema } from '@mcify/core';
```

## `schema.id(maxLength?)`

```ts
schema.id(); // .string().min(1)
schema.id(64); // .string().min(1).max(64)
```

Use for opaque external identifiers (third-party payment IDs, vendor SKUs, etc.) when you don't know if the upstream uses UUIDs, slugs, or something else. If you know it's a UUID, use `z.string().uuid()` instead.

## `schema.url()` and `schema.httpUrl()`

```ts
schema.url(); // .string().url()
schema.httpUrl(); // .string().url() with an http(s):// regex guard
```

`httpUrl` is the safer default for tools that pass URLs to `fetch` — it rejects `file://`, `data:`, and similar that you almost never want to forward to an upstream API.

## `schema.timestamp()`

```ts
schema.timestamp(); // .string().datetime()
```

ISO 8601 with `Z` suffix. The agent learns `'YYYY-MM-DDTHH:MM:SS.sssZ'` from the JSON Schema format.

## `schema.money({ minor?: boolean })`

```ts
schema.money(); // { amount: number, currency: string }
schema.money({ minor: true }); // { amountMinor: number (integer), currency: string }
```

`amount` (default) is the major unit (CLP pesos, USD dollars). Pass `{ minor: true }` for integer minor units (cents, satoshis). Document which one in your tool's `.describe()` either way.

## `schema.paginated(itemSchema)`

```ts
schema.paginated(z.object({ id: z.string(), name: z.string() }));
// → z.object({
//     items: z.array(...),
//     nextCursor: z.string().optional(),
//     totalApprox: z.number().optional(),
//   })
```

Standard pagination envelope. `nextCursor` for opaque cursor-based pagination, `totalApprox` for "about N total" hints (don't promise exactness — most APIs can't deliver it cheaply).

## When to roll your own

These helpers cover the 80% case. For domain-specific shapes (e.g. a Chilean RUT, a SKU pattern your business defined), define your own and re-use:

```ts
const Rut = z
  .string()
  .regex(/^\d{1,2}\.\d{3}\.\d{3}-[\dKk]$/)
  .describe('Chilean RUT, formatted "11.111.111-1"');
```

Put those in `src/schemas.ts` and reuse across tools. The [from-zod template](/start/install/) sets up exactly this pattern.
