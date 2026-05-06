import { defineConfig } from '@playwright/test';

/**
 * E2E config for the inspector. The `webServer` block boots `mcify dev`
 * against the Khipu example for the duration of the test run, then tears
 * it down. No real Khipu calls happen — tests interact with the inspector
 * UI only (Tools tab, Calls Log, Playground tab).
 */

const INSPECTOR_PORT = 3019;
const MCP_PORT = 8819;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false, // Single test runs against a single mcify dev instance.
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',

  use: {
    baseURL: `http://localhost:${INSPECTOR_PORT}`,
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: 'on-first-retry',
  },

  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],

  webServer: {
    command:
      'node ../cli/dist/cli.js dev --port ' +
      MCP_PORT +
      ' --inspector-port ' +
      INSPECTOR_PORT +
      ' --no-watch --config e2e/fixtures/test.config.ts',
    cwd: '.',
    port: INSPECTOR_PORT,
    timeout: 30_000,
    reuseExistingServer: !process.env['CI'],
    env: {
      KHIPU_API_KEY: 'dummy-test',
      MCIFY_AUTH_TOKEN: 'test-token',
    },
  },
});
