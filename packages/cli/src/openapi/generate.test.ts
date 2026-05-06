import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateFromOpenApi } from './generate.js';
import type { OpenApiDocument } from './types.js';

const sampleSpec: OpenApiDocument = {
  openapi: '3.0.3',
  info: { title: 'Users API', version: '1.0.0' },
  servers: [{ url: 'https://api.example.com/v1' }],
  components: {
    schemas: {
      User: {
        type: 'object',
        required: ['id', 'email'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          fullName: { type: 'string' },
        },
      },
    },
    securitySchemes: {
      bearer: { type: 'http', scheme: 'bearer' },
    },
  },
  security: [{ bearer: [] }],
  paths: {
    '/users': {
      get: {
        operationId: 'listUsers',
        summary: 'List all users',
        parameters: [
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100 },
          },
        ],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/User' } },
              },
            },
          },
        },
      },
      post: {
        operationId: 'createUser',
        summary: 'Create a user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  fullName: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Created',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/User' } },
            },
          },
        },
      },
    },
    '/users/{userId}': {
      get: {
        operationId: 'getUser',
        parameters: [
          {
            name: 'userId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/User' } },
            },
          },
        },
      },
    },
  },
};

describe('generateFromOpenApi', () => {
  let tmpDir: string;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcify-openapi-gen-'));
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('emits a single file with all operations as defineTool calls', async () => {
    const result = await generateFromOpenApi({
      source: 'fixture',
      outDir: 'src/generated',
      prefix: 'users',
      document: sampleSpec,
    });

    expect(result.toolCount).toBe(3);
    expect(result.outFile).toBe(path.join(tmpDir, 'src/generated/users.ts'));

    const content = await fs.readFile(result.outFile, 'utf-8');

    // The header matches the source service.
    expect(content).toContain('Users API v1.0.0');

    // Tool names use the prefix.
    expect(content).toContain('name: "users_list_users"');
    expect(content).toContain('name: "users_create_user"');
    expect(content).toContain('name: "users_get_user"');

    // Component schemas land as top-level consts.
    expect(content).toContain('export const User = z.object(');

    // Tool factory wires the GeneratedClient.
    expect(content).toContain('export const users_tools = (client: GeneratedClient) =>');

    // Bearer auth wired in the client setup, mutating `merged` (not the
    // caller's headers) and guarded so a token-less client doesn't blow up.
    expect(content).toContain(
      "if (opts.token !== undefined) merged['authorization'] = `Bearer ${opts.token}`",
    );

    // Path param substitution lands in the URL build.
    expect(content).toContain('${encodeURIComponent(String(input["userId"]))}');

    // Body field appears for POST.
    expect(content).toContain('body: z.object(');
  });

  it('handles missing operationIds with a method+path fallback name', async () => {
    const docNoOpId: OpenApiDocument = {
      openapi: '3.0.3',
      info: { title: 'X', version: '1' },
      paths: {
        '/items/{id}/sub': {
          get: {
            // operationId omitted intentionally
            responses: { '200': { description: 'OK' } },
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          },
        },
      },
    };

    const result = await generateFromOpenApi({
      source: 'fixture',
      outDir: 'gen',
      prefix: 'svc',
      document: docNoOpId,
    });
    const content = await fs.readFile(result.outFile, 'utf-8');
    expect(content).toContain('name: "svc_get_items_id_sub"');
  });

  it('writes an api-key auth scheme as the configured header', async () => {
    const doc: OpenApiDocument = {
      openapi: '3.0.3',
      info: { title: 'X', version: '1' },
      components: {
        securitySchemes: {
          apiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
        },
      },
      security: [{ apiKey: [] }],
      paths: {
        '/ping': {
          get: {
            operationId: 'ping',
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };

    const result = await generateFromOpenApi({
      source: 'fixture',
      outDir: 'gen',
      prefix: 'svc',
      document: doc,
    });
    const content = await fs.readFile(result.outFile, 'utf-8');
    expect(content).toContain('if (opts.token !== undefined) merged["x-api-key"] = opts.token');
  });
});
