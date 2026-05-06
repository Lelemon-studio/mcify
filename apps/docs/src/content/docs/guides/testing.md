---
title: Testing without the network
description: Use createTestClient + a mocked fetch to verify tools without hitting upstream APIs.
---

The runtime ships a test helper that exercises the same dispatch path as production HTTP — but in-process and with `fetch` you can mock.

## The pattern

```ts
import { describe, it, expect, vi } from 'vitest';
import { createTestClient } from '@mcify/runtime/test';
import config from '../mcify.config.js';

describe('khipu_create_payment', () => {
  it('returns the upstream payment URL', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ payment_id: 'p_abc', payment_url: 'https://khipu.com/pay/abc' }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        ),
      );

    const client = createTestClient(config, {
      auth: { type: 'bearer', token: 'test' },
      fetch: fetchMock,
    });

    const result = await client.callTool('khipu_create_payment', {
      subject: 'Order #1',
      currency: 'CLP',
      amount: 50000,
    });

    expect(result.paymentId).toBe('p_abc');
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
```

`createTestClient` wires:

- The auth state your handler sees (`ctx.auth`).
- The `fetch` your handler calls via `ctx.fetch`.
- The same input/output validation, middleware chain, and error mapping as the HTTP path.

## Why `mockImplementation` and not `mockResolvedValue`

`Response.text()` (and `.json()`) can be read **once**. If the same Response object comes back from a mock that reuses a single instance, the second test call gets an empty body. Use `mockImplementation` so each call constructs a fresh Response:

```ts
// Bad — second call reads an empty body
vi.fn().mockResolvedValue(ok({ ... }));

// Good — fresh Response each call
vi.fn().mockImplementation(() => Promise.resolve(ok({ ... })));
```

This is the most common gotcha when porting tests from other frameworks.

## Asserting on the request

The mock captures every call. You can check the URL, method, and body:

```ts
const [url, init] = fetchMock.mock.calls[0]!;
expect(url).toBe('https://payment-api.khipu.com/v3/payments');
expect((init as RequestInit).method).toBe('POST');
const body = JSON.parse((init as RequestInit).body as string);
expect(body.subject).toBe('Order #1');
```

## Errors

When the mocked upstream returns non-2xx, your handler should throw. The runtime wraps the thrown error into the MCP `CallToolResult` shape; from the test's perspective `client.callTool` rejects:

```ts
fetchMock.mockImplementation(() =>
  Promise.resolve(new Response('{"error":"Invalid"}', { status: 400 })),
);

await expect(
  client.callTool('khipu_create_payment', { ... }),
).rejects.toThrow(/Invalid/);
```

## When to mock vs hit the network

| Mock the upstream                     | Hit a sandbox                               |
| ------------------------------------- | ------------------------------------------- |
| Unit tests (per-tool, per-error-path) | Integration test that runs once per release |
| Handler logic (mapping, branching)    | Auth flow with real signatures              |
| CI runs (no network credentials)      | Pre-deploy smoke check                      |

The connector packages in `packages/examples/*` follow this split: every commit's tests are mocked; the dogfooding loop in `lelemon-app` exercises real Khipu sandbox calls before ship.
