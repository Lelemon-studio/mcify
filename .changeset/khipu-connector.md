---
'@mcify/runtime': patch
---

Test client now accepts a `fetch` option to inject mocks via `ctx.fetch`,
making it trivial to test tools that hit external APIs without
monkey-patching globals.

```ts
const client = createTestClient(config, {
  auth: { type: 'bearer', token: 't' },
  fetch: vi.fn().mockResolvedValue(new Response('{...}')),
});
```
