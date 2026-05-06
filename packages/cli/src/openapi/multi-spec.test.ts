import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateFromOpenApi } from './generate.js';
import type { OpenApiDocument } from './types.js';

const usersSpec: OpenApiDocument = {
  openapi: '3.0.3',
  info: { title: 'Users', version: '1' },
  servers: [{ url: 'https://api.example.com/users' }],
  paths: {
    '/users': {
      get: {
        operationId: 'listUsers',
        responses: { '200': { description: 'OK' } },
      },
    },
  },
};

const billingSpec: OpenApiDocument = {
  openapi: '3.0.3',
  info: { title: 'Billing', version: '1' },
  servers: [{ url: 'https://api.example.com/billing' }],
  paths: {
    '/invoices': {
      get: {
        operationId: 'listInvoices',
        responses: { '200': { description: 'OK' } },
      },
    },
  },
};

describe('generateFromOpenApi (multi-spec)', () => {
  let tmpDir: string;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcify-multi-spec-'));
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes one file per spec, isolating tool prefixes', async () => {
    const a = await generateFromOpenApi({
      source: 'users',
      outDir: 'src/generated',
      prefix: 'users',
      document: usersSpec,
    });
    const b = await generateFromOpenApi({
      source: 'billing',
      outDir: 'src/generated',
      prefix: 'billing',
      document: billingSpec,
    });

    expect(path.basename(a.outFile)).toBe('users.ts');
    expect(path.basename(b.outFile)).toBe('billing.ts');

    const usersOut = await fs.readFile(a.outFile, 'utf-8');
    const billingOut = await fs.readFile(b.outFile, 'utf-8');

    // Tool names carry the prefix → no collision in a unified `mcify.config.ts`.
    expect(usersOut).toContain('"users_list_users"');
    expect(billingOut).toContain('"billing_list_invoices"');

    // Each file has its own factory and client.
    expect(usersOut).toContain('export const users_tools');
    expect(usersOut).toContain('export const create_users_client');
    expect(billingOut).toContain('export const billing_tools');
    expect(billingOut).toContain('export const create_billing_client');

    // Per-spec base URL is baked in as the default.
    expect(usersOut).toContain('https://api.example.com/users');
    expect(billingOut).toContain('https://api.example.com/billing');
  });
});
