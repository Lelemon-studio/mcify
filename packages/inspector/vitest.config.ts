import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Vitest auto-discovers files matching `**/*.{test,spec}.{ts,tsx,js}` by
    // default. The Playwright suite under `e2e/` is also `*.spec.ts`, so
    // without this exclude vitest would try to evaluate it (and explode
    // because Playwright's `test.describe` only runs in the Playwright
    // worker, not under vitest).
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
});
