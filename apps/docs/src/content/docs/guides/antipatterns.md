---
title: Antipatterns to avoid
description: Six concrete failure modes when building tools, why they break, and what to do instead.
---

These are the patterns that make agents pick the wrong tool, call it with wrong args, or fail to recover from errors. Each one is paired with a fix. Drawn from Anthropic's [Writing Tools for Agents](https://www.anthropic.com/engineering/writing-tools-for-agents) plus practical experience from the Lelemon Agentes connectors.

## 1. Vague descriptions / overlapping purposes

**The smell:**

```ts
defineTool({
  name: 'search_users',
  description: 'Search users.',
  ...
});

defineTool({
  name: 'list_users',
  description: 'List users.',
  ...
});
```

The agent has no way to choose. It either picks one at random, calls both, or asks the user to clarify (wasted turn).

**Fix:** consolidate into one tool with a discriminating parameter, _or_ differentiate the descriptions so each one's trigger is obvious.

```ts
defineTool({
  name: 'users_query',
  description:
    'Find users. Pass `query` for free-text search across name/email; ' +
    'leave empty to list the most-recent. Returns up to 50 per page.',
  input: z.object({
    query: z.string().optional(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  ...
});
```

## 2. Returning everything, unfiltered

**The smell:**

```ts
handler: async () => {
  const all = await db.contacts.findAll(); // 47,000 rows
  return { contacts: all };
};
```

The response is enormous. The agent burns tokens parsing it. The model's context window fills with mostly irrelevant data.

**Fix:** require pagination + filters in the schema. Truncate proactively. Tell the agent in the response when there's more.

```ts
input: z.object({
  query: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
}),
output: z.object({
  contacts: z.array(Contact),
  nextCursor: z.string().optional(),
  totalApprox: z.number().optional(),
}),
handler: async (input) => {
  const page = await db.contacts.find(input.query, { limit: input.limit, cursor: input.cursor });
  return {
    contacts: page.items,
    ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    ...(page.totalApprox ? { totalApprox: page.totalApprox } : {}),
  };
},
```

## 3. Ambiguous parameter names

**The smell:**

```ts
input: z.object({
  user: z.string(),         // a name? an email? an id?
  type: z.string(),         // of what?
  data: z.record(z.any()),  // good luck
}),
```

The agent is forced to guess. It picks one interpretation and is wrong half the time.

**Fix:** name parameters by the _thing they identify_, not by their abstract role. Add `.describe()` with format hints.

```ts
input: z.object({
  userId: z.string().uuid().describe('User UUID, e.g. "550e8400-e29b-..."'),
  documentType: z.enum(['invoice', 'receipt', 'credit_note']).describe('SII tax document type'),
  lineItems: z.array(LineItem).min(1).describe('At least one item; net unit price + quantity per row'),
}),
```

If a field is `Record<string, unknown>`, the agent is reading your mind. Replace it with a typed object every time you can.

## 4. Hidden side effects

**The smell:**

```ts
defineTool({
  name: 'update_user',
  description: 'Update a user.',
  handler: async (input) => {
    await db.users.update(input);
    await sendEmail(input.email, 'profile changed'); // surprise
    await audit.log({ kind: 'sensitive_change', userId: input.id }); // surprise
  },
});
```

The agent doesn't know the email goes out. It calls `update_user` to fix a typo and a customer gets a passive-aggressive notification.

**Fix:** put every side effect in the description. Offer a `dry_run` if the action is destructive or expensive.

```ts
defineTool({
  name: 'update_user',
  description:
    'Update a user. Sends a "your profile changed" email to the user and ' +
    'writes an audit log entry. Pass `notify: false` to skip the email; ' +
    'audit log is always written.',
  input: z.object({
    userId: z.string().uuid(),
    patch: UserPatch,
    notify: z.boolean().default(true),
  }),
  ...
});
```

Mute-by-default is generally a worse default than notify-by-default — but the agent needs to know either way.

## 5. Schemas without per-field descriptions

**The smell:**

```ts
input: z.object({
  status: z.enum(['p', 'v', 'd', 'c', 'f', 'r']),
  amount: z.number(),
  currency: z.string(),
}),
```

`status: 'c'` — committed? cancelled? closed? The agent guesses. The model hallucinates `currency: 'pesos'` when the API expects `'CLP'`.

**Fix:** describe every non-obvious field. Cap free-form strings with `enum` or `regex` if the upstream API does.

```ts
input: z.object({
  status: z
    .enum(['pending', 'verifying', 'done', 'committed', 'failed', 'rejected'])
    .describe('Khipu payment status — see https://docs.khipu.com/api/payments'),
  amount: z.number().positive().describe('Amount in the major unit (CLP pesos, USD dollars)'),
  currency: z.enum(['CLP', 'USD']).describe('ISO 4217 code, only CLP and USD supported'),
}),
```

## 6. Tools that are too granular

**The smell:**

```ts
get_user_email(userId);
get_user_name(userId);
get_user_role(userId);
get_user_created_at(userId);
get_user_last_login(userId);
```

To answer "what's this user's role and last login," the agent makes two calls. To render a profile, five.

**Fix:** group fetches that always travel together into one tool. Let the caller subset, not the agent.

```ts
defineTool({
  name: 'users_get',
  description: 'Fetch a user by id. Returns the full profile.',
  input: z.object({ userId: z.string().uuid() }),
  output: User,  // includes email, name, role, createdAt, lastLogin, ...
  ...
});
```

The mirror-image antipattern is _too_ coarse:

```ts
do_user_thing(userId, action: 'create' | 'update' | 'delete' | 'reset_password' | ...)
```

Don't bundle unrelated operations behind a `kind` field. The right granularity is "one tool per logical operation, not one per HTTP endpoint and not one per micro-attribute."

## Bonus: the universal mistake

**Returning a string when you could return an object.**

```ts
// Bad
output: z.string(),
handler: async (...) => `Payment p_abc created; pay at https://... by 2026-05-12.`,

// Good
output: z.object({
  paymentId: z.string(),
  paymentUrl: z.string().url(),
  expiresAt: z.string().datetime(),
}),
handler: async (...) => ({ paymentId: 'p_abc', paymentUrl: '...', expiresAt: '2026-05-12T00:00:00Z' }),
```

The agent can `result.paymentUrl` an object. It has to grep a string. Always return structured.

## Next

- [Creating effective tools](/guides/creating-effective-tools/) — the positive-form best practices.
- [Concepts → Tools](/concepts/tools/) — the `defineTool` API reference.
