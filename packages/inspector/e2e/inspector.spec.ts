import { expect, test } from '@playwright/test';

test.describe('mcify inspector', () => {
  test('boots and shows the server name', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('mcify', { exact: true })).toBeVisible();
    await expect(page.getByText(/e2e-fixture@0\.1\.0/)).toBeVisible();
    // WS handshake should flip the status indicator from "connecting" to "live".
    await expect(page.getByText('live', { exact: true })).toBeVisible({ timeout: 5_000 });
  });

  test('Tools tab lists the registered tools', async ({ page }) => {
    await page.goto('/');
    // Tools tab is the default landing tab.
    await expect(page.getByText('greet', { exact: true })).toBeVisible();
    await expect(page.getByText('always_fails', { exact: true })).toBeVisible();
    await expect(page.getByText(/Say hello to someone/)).toBeVisible();
  });

  test('Playground invokes a tool and the call shows up in Calls Log', async ({ page }) => {
    await page.goto('/');

    // Wait for the WS to be live so tool:called events stream into the
    // Calls Log. Without this, the test races against the WS handshake.
    await expect(page.getByText('live', { exact: true })).toBeVisible({ timeout: 5_000 });

    // Switch to Playground.
    await page.getByRole('button', { name: 'Playground' }).click();

    // The greet tool is preselected (first in the list).
    await expect(page.getByRole('combobox')).toHaveValue('greet');

    // Replace the args with valid JSON.
    const args = page.getByRole('textbox');
    await args.fill('{"name":"e2e"}');

    // Invoke.
    await page.getByRole('button', { name: 'Invoke' }).click();

    // Result panel renders the MCP CallToolResult — the handler output is
    // serialized into the first content block's `text` field.
    await expect(page.getByText(/Hello, e2e!/)).toBeVisible({ timeout: 3_000 });

    // The call streamed to the Calls Log via WebSocket — switch tabs and verify.
    await page.getByRole('button', { name: 'Calls Log' }).click();
    await expect(page.getByRole('cell', { name: 'greet', exact: true })).toBeVisible();
    await expect(page.getByText('ok', { exact: true })).toBeVisible();
  });

  test('failing tool surfaces an error in the Calls Log', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('live', { exact: true })).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: 'Playground' }).click();

    // Pick the failing tool.
    await page.getByRole('combobox').selectOption('always_fails');
    await page.getByRole('textbox').fill('{}');
    await page.getByRole('button', { name: 'Invoke' }).click();

    // The Playground response area surfaces the error.
    await expect(page.getByText(/intentional test failure/)).toBeVisible({ timeout: 3_000 });

    // Calls Log marks the call as err.
    await page.getByRole('button', { name: 'Calls Log' }).click();
    await expect(page.getByText('err', { exact: true })).toBeVisible();
  });

  test('Settings tab persists theme + log retention across reloads', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings' }).click();
    // Topbar also renders the server name — match the row inside the panel.
    await expect(page.getByRole('cell', { name: 'e2e-fixture@0.1.0' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'TOOLS' })).toBeVisible();

    // Switch theme, drop the call retention to a small number.
    await page.getByLabel('Theme').selectOption('light');
    await page.getByLabel('Max calls in log').fill('25');

    // Storage should now contain the new values.
    const stored = await page.evaluate(() =>
      window.localStorage.getItem('mcify-inspector:settings'),
    );
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored!)).toMatchObject({ theme: 'light', maxCalls: 25 });

    // After a reload the same selections should be visible.
    await page.reload();
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByLabel('Theme')).toHaveValue('light');
    await expect(page.getByLabel('Max calls in log')).toHaveValue('25');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('SSE notifications endpoint streams text/event-stream', async ({ page }) => {
    await page.goto('/');
    // Run the fetch from the page so we can abort the stream cleanly. A raw
    // `request.get()` would block waiting for body bytes that never come on
    // a long-lived SSE connection.
    const result = await page.evaluate(async () => {
      const ctrl = new AbortController();
      const res = await fetch('/api/notifications', { signal: ctrl.signal });
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k] = v;
      });
      const status = res.status;
      ctrl.abort();
      return { status, contentType: headers['content-type'] ?? '' };
    });
    expect(result.status).toBe(200);
    expect(result.contentType).toContain('text/event-stream');
  });
});
