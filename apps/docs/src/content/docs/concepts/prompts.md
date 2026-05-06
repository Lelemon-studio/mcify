---
title: Prompts
description: Pre-built message templates the agent requests by name.
---

A prompt is a parameterized message template the agent can fetch. Useful when you want to standardize how an agent should handle a recurring request — you ship the template, the agent substitutes the args.

```ts
import { definePrompt } from '@mcify/core';
import { z } from 'zod';

export const refundFlow = definePrompt({
  name: 'refund_flow',
  description: 'Walk the agent through gathering info to issue a refund.',
  argumentsSchema: z.object({
    orderId: z.string(),
    locale: z.enum(['es', 'en']).default('es'),
  }),
  render: async ({ orderId, locale }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text:
            locale === 'es'
              ? `Quiero hacer un refund de la orden ${orderId}. Pide motivo y monto, luego confirma.`
              : `I want to refund order ${orderId}. Ask the user for reason and amount, then confirm.`,
        },
      },
    ],
  }),
});
```

The agent discovers prompts via `prompts/list` and pulls a specific one with `prompts/get`.

## When to use a prompt

- You want a standard format for a multi-turn conversation that always starts the same way.
- Localization: serve `es`/`en`/`pt` versions of the same script.
- Compliance: legal text that must appear verbatim in a specific flow.

If you'd write the prose in your agent's system message anyway, a prompt is just a way to keep it on the server (versioned, edit-without-deploy) instead of in the agent's code.

## Wiring

```ts
defineConfig({ prompts: [refundFlow], ... });
```

Prompts are part of `tools/list` discovery — the runtime exposes them on the `prompts/*` JSON-RPC methods automatically.
