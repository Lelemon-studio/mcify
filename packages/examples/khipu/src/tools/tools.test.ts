import { describe, it, expect, vi } from 'vitest';
import { defineConfig, bearer } from '@mcify/core';
import { createTestClient } from '@mcify/runtime/test';
import { KhipuClient } from '../client.js';
import { createKhipuCreatePaymentTool } from './create-payment.js';
import { createKhipuGetPaymentStatusTool } from './get-payment-status.js';

const buildConfigWithMockFetch = (fetchMock: typeof globalThis.fetch) => {
  const client = new KhipuClient({ apiKey: 'k_test', fetch: fetchMock });
  return defineConfig({
    name: 'khipu-test',
    version: '0.1.0',
    auth: bearer({ env: 'MCIFY_AUTH_TOKEN' }),
    tools: [createKhipuCreatePaymentTool(client), createKhipuGetPaymentStatusTool(client)],
  });
};

const okJson = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

describe('khipu_create_payment tool', () => {
  it('end-to-end: validates input, calls Khipu, returns the parsed result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okJson({
        payment_id: 'p_123',
        payment_url: 'https://khipu.com/payment/info/abc',
        ready_for_terminal: false,
      }),
    );
    const client = createTestClient(buildConfigWithMockFetch(fetchMock), {
      auth: { type: 'bearer', token: 'agent-token' },
    });

    const result = await client.invokeTool<{ paymentId: string; paymentUrl: string }>(
      'khipu_create_payment',
      {
        subject: 'Order #42',
        currency: 'CLP',
        amount: 12990,
        returnUrl: 'https://example.com/return',
      },
    );

    expect(result.paymentId).toBe('p_123');
    expect(result.paymentUrl).toBe('https://khipu.com/payment/info/abc');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects unauthenticated calls (requireAuth middleware)', async () => {
    const fetchMock = vi.fn();
    const client = createTestClient(buildConfigWithMockFetch(fetchMock));
    // No auth → requireAuth() short-circuits before the handler runs.
    await expect(
      client.invokeTool('khipu_create_payment', {
        subject: 'x',
        currency: 'CLP',
        amount: 1,
      }),
    ).rejects.toThrow(/authentication/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects bad input before any HTTP call (Zod boundary)', async () => {
    const fetchMock = vi.fn();
    const client = createTestClient(buildConfigWithMockFetch(fetchMock), {
      auth: { type: 'bearer', token: 't' },
    });
    await expect(
      client.invokeTool('khipu_create_payment', {
        subject: '',
        currency: 'CLP',
        amount: -1,
      }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('khipu_get_payment_status tool', () => {
  it('end-to-end: returns the parsed payment detail', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okJson({
        payment_id: 'p_done',
        status: 'done',
        subject: 'Order #1',
        currency: 'CLP',
        amount: 50000,
        transaction_id: 'order-1',
      }),
    );
    const client = createTestClient(buildConfigWithMockFetch(fetchMock), {
      auth: { type: 'bearer', token: 't' },
    });

    const result = await client.invokeTool<{ status: string }>('khipu_get_payment_status', {
      paymentId: 'p_done',
    });
    expect(result.status).toBe('done');
  });

  it('surfaces upstream errors with their original message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Payment not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = createTestClient(buildConfigWithMockFetch(fetchMock), {
      auth: { type: 'bearer', token: 't' },
    });
    await expect(
      client.invokeTool('khipu_get_payment_status', { paymentId: 'p_missing' }),
    ).rejects.toThrow(/Payment not found/);
  });
});
