---
title: Creating effective tools
description: Best practices for writing tools that AI agents call correctly the first time.
---

The agent has hundreds of tools across dozens of MCP servers in its context. It picks yours based on three signals: name, description, and per-field descriptions. Get those right and your tool gets called correctly. Get them wrong and the agent either skips your tool or calls it with malformed args and a wrong understanding of the result.

This guide is the long version of "what works." For the things to _not_ do, see [Antipatterns](/guides/antipatterns/).

## The three things the agent reads

```ts
defineTool({
  name: 'khipu_create_payment',                      // 1. Identity — keep it stable.
  description:                                       // 2. Decision signal.
    'Create a Khipu payment link. Returns a payment_url the customer ' +
    'opens to pay via Chilean banks. Use for one-shot charges; no ' +
    'recurring support.',
  input: z.object({
    subject: z.string()
      .describe('Short text shown on the bank screen, e.g. "Order #1234"'),  // 3. Each field.
    ...
  }),
  ...
});
```

### Name: stable, prefixed, snake_case

- **Stable.** Renaming a tool is a breaking change for every agent that's been told about it. If the operation changes, version it (`v2_`) instead of renaming.
- **Prefixed.** The same agent might have `users_list` from your service and `list_users` from another. Snake-prefix by service or domain (`khipu_`, `inventory_`, `support_`).
- **Verb-object.** `create_payment`, not `payment_creator`. The agent thinks in actions.

### Description: what it does, _when_ to use it

Two sentences. First: action and result. Second: trigger condition or constraint.

> Create a Khipu payment link. Returns a `payment_url` the customer opens to pay via Chilean banks. **Use for one-shot charges; no recurring support.**

The "use for X; not Y" sentence is the most undervalued part of any tool description. It's the line that prevents the agent from calling your one-shot payment tool to set up a subscription.

Other things to put in description:

- **Side effects.** "Sends an email to the customer" / "Logs to the audit table" — the agent should know.
- **Latency hints when extreme.** "This call typically takes 30 seconds; consider running it in the background."
- **Cost signals.** "Each call charges the customer's card."

Don't put:

- The schema (it's already in `input`).
- "This tool" / "This function" — the agent knows it's a tool.
- Marketing language. The agent is reading, not buying.

### Per-field `.describe()`

Every input field should have a `.describe()`. Especially:

- **Identifiers** — what shape are they? `'Khipu payment id, like "p_abcd..."'` is more useful than just "the id".
- **Enums** — when the values aren't self-explanatory. `z.enum(['done', 'committed'])` should describe what 'committed' means vs 'done'.
- **Money / units.** `'Amount in CLP (no decimals)'` vs `'Amount in USD cents'` vs `'Amount in BTC satoshis'`. Pick one, document it.
- **Dates / times.** `'ISO 8601 in UTC'` vs `'YYYY-MM-DD'` vs `'unix timestamp seconds'`.

```ts
input: z.object({
  paymentId: z
    .string()
    .regex(/^p_[a-z0-9]{16}$/)
    .describe('Khipu payment id (returned by khipu_create_payment), shape p_<16 alphanumeric>'),
  amount: z
    .number()
    .positive()
    .describe('Amount in the major unit (CLP pesos, USD dollars). Do not pass cents.'),
}),
```

## Schema sizing

The agent generates structured args. The looser your schema, the more it has to invent. The tighter your schema, the more often it gets things right on the first try.

**Use enums when the value set is closed.** Don't take a free-form `status: string` if the API only accepts `'pending' | 'done' | 'failed'`.

**Use formats.** `z.string().email()`, `.uuid()`, `.url()` — Zod renders these as JSON Schema with `format`, which Claude / GPT honor.

**Use min/max for numbers and lengths.** `z.string().max(255)` keeps the agent from passing your 4KB internal note into a `subject` field.

**Don't over-validate.** `z.string().regex(/^[a-zA-Z0-9-_]{8,32}$/)` for a name field is too strict and forces the agent into trial-and-error. If the upstream API would accept "User Tester", let yours.

## Output shape

Return objects, not strings. The agent can introspect an object and decide what to do next; it has to grep a string.

```ts
// Good
output: z.object({
  paymentId: z.string(),
  paymentUrl: z.string().url(),
  expiresAt: z.string().datetime(),
}),

// Bad
output: z.string(),  // "Created payment p_abc; pay at https://... by 2026-05-12T00:00:00Z"
```

Even when the upstream returns a string, parse it into a structure if you can.

## Errors as messages

When something goes wrong, the message you throw becomes context for the agent's next turn. Make it actionable.

```ts
// Good — agent can recover (lookup the right user, retry with the right id)
throw new Error(`User ${input.userId} not found in Khipu. Check the id with khipu_list_users.`);

// Bad — agent has no path forward
throw new Error('Khipu request failed: 404');
```

Use [`McifyValidationError`](/reference/core/#mcifyvalidationerror) for input/output drift — the runtime serializes it with `phase` and the offending field, so the agent knows whether to fix its args or give up.

## Granularity

> One tool per logical operation. Not one per HTTP endpoint.

When mapping an API to MCP, resist the urge to make 1:1 tools for every CRUD endpoint. Group:

- **Idempotent reads** can stay 1:1. `users_list`, `users_get`, `users_search` — fine.
- **Multi-step writes should be one tool.** `create_payment_with_callback` is one tool that internally hits two endpoints. The agent shouldn't have to orchestrate.
- **Variants of one operation should be one tool with a discriminator.** `create_payment(currency: 'CLP'|'USD')` not `create_clp_payment` + `create_usd_payment`.

The right number of tools is "as few as possible while still letting the agent achieve every supported task." When you're not sure, ship fewer; you can split later. Splitting is forward-compatible (the old tool still works); merging is breaking.

## Middleware: defaults that scale

Every tool should have at minimum:

```ts
middlewares: [
  requireAuth(),
  rateLimit({ max: <reasonable>, windowMs: 60_000 }),
  withTimeout({ ms: <reasonable> }),
],
```

Reasonable values depend on the operation:

| Operation type                             | rateLimit max/min | timeout ms |
| ------------------------------------------ | ----------------- | ---------- |
| Read (list / get)                          | 120–240           | 5,000      |
| Search                                     | 60                | 8,000      |
| Idempotent write (upsert)                  | 60                | 8,000      |
| Side-effect write (charge / send / refund) | 30                | 15,000     |
| Slow side-effect (export, batch)           | 5                 | 60,000     |

## Test the description with a real agent

Before you ship, point Claude / Cursor at your local server and ask, in plain language, to do the thing. If the agent picks the right tool with the right args on the first try, the description is good. If you have to coach it ("you should use the X tool"), the description is hiding information.

The inspector's [Chat tab](/start/connect-clients/) is the fastest way to do this loop — paste an API key, send a message, watch the tool call appear in the calls log.

## Next

- [Antipatterns](/guides/antipatterns/) — what _not_ to do, with concrete examples.
- [AI prompts → Add a tool](/prompts/add-tool/) — copy-paste prompt for Claude Code that walks the canonical pattern.
- [Concepts → Tools](/concepts/tools/) — the API reference for `defineTool`.
