import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { init } from './init.js';
import { getTemplatesRoot } from '../paths.js';

describe('init', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcify-init-'));
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('scaffolds a from-scratch project with substituted name', async () => {
    const { dir } = await init({ name: 'my-mcp', templatesRoot: getTemplatesRoot() });
    expect(dir).toBe(path.join(tmpDir, 'my-mcp'));

    const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf-8')) as {
      name: string;
      type: string;
    };
    expect(pkg.name).toBe('my-mcp');
    expect(pkg.type).toBe('module');

    const config = await fs.readFile(path.join(dir, 'mcify.config.ts'), 'utf-8');
    expect(config).toContain("name: 'my-mcp'");

    const readme = await fs.readFile(path.join(dir, 'README.md'), 'utf-8');
    expect(readme).toContain('# my-mcp');

    // AGENTS.md is the universal AI-agent contract for the user's project.
    // It must exist and have the project name substituted.
    const agents = await fs.readFile(path.join(dir, 'AGENTS.md'), 'utf-8');
    expect(agents).toContain('# AGENTS.md — AI agent instructions for my-mcp');
    expect(agents).toContain('Adding a tool');
  });

  it('renames _gitignore to .gitignore', async () => {
    const { dir } = await init({ name: 'demo', templatesRoot: getTemplatesRoot() });
    const ignore = await fs.readFile(path.join(dir, '.gitignore'), 'utf-8');
    expect(ignore).toContain('node_modules/');

    // The leading underscore version should not exist.
    await expect(fs.access(path.join(dir, '_gitignore'))).rejects.toThrow();
  });

  it('throws when target directory already exists', async () => {
    await fs.mkdir(path.join(tmpDir, 'exists'));
    await expect(init({ name: 'exists', templatesRoot: getTemplatesRoot() })).rejects.toThrow(
      /already exists/,
    );
  });

  it('throws on unknown template', async () => {
    await expect(
      init({ name: 'demo', template: 'does-not-exist', templatesRoot: getTemplatesRoot() }),
    ).rejects.toThrow(/Unknown template/);
  });

  it('honors --dir override', async () => {
    const { dir } = await init({
      name: 'demo',
      dir: 'custom-name',
      templatesRoot: getTemplatesRoot(),
    });
    expect(dir).toBe(path.join(tmpDir, 'custom-name'));
  });

  it('scaffolds the from-zod template with shared schemas + tools that import them', async () => {
    const { dir } = await init({
      name: 'my-zod-mcp',
      template: 'from-zod',
      templatesRoot: getTemplatesRoot(),
    });

    const schemas = await fs.readFile(path.join(dir, 'src/schemas.ts'), 'utf-8');
    expect(schemas).toContain('export const User');
    expect(schemas).toContain('export const CreateUserInput');

    const createTool = await fs.readFile(path.join(dir, 'src/tools/create-user.ts'), 'utf-8');
    expect(createTool).toContain("from '../schemas.js'");
    expect(createTool).toContain("name: 'create_user'");

    const config = await fs.readFile(path.join(dir, 'mcify.config.ts'), 'utf-8');
    expect(config).toContain("name: 'my-zod-mcp'");
    expect(config).toContain('createUser');
    expect(config).toContain('getUser');

    const agents = await fs.readFile(path.join(dir, 'AGENTS.md'), 'utf-8');
    expect(agents).toContain('AI agent instructions for my-zod-mcp');
  });

  it('scaffolds the example-khipu template with the project name in package.json', async () => {
    const { dir } = await init({
      name: 'mi-khipu',
      template: 'example-khipu',
      templatesRoot: getTemplatesRoot(),
    });
    const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf-8')) as {
      name: string;
    };
    expect(pkg.name).toBe('mi-khipu');

    // Connector source is copied verbatim — no placeholder substitution
    // inside `client.ts` because it has no `{{name}}` markers.
    const client = await fs.readFile(path.join(dir, 'src/client.ts'), 'utf-8');
    expect(client).toContain('class KhipuClient');

    const tool = await fs.readFile(path.join(dir, 'src/tools/create-payment.ts'), 'utf-8');
    expect(tool).toContain("name: 'khipu_create_payment'");

    // mcify.config.ts uses the literal `khipu` server name (not {{name}}) —
    // the MCP server identity stays `khipu` regardless of project directory.
    const config = await fs.readFile(path.join(dir, 'mcify.config.ts'), 'utf-8');
    expect(config).toContain("name: 'khipu'");

    // AGENTS.md substitutes {{name}}.
    const agents = await fs.readFile(path.join(dir, 'AGENTS.md'), 'utf-8');
    expect(agents).toContain('AI agent instructions for mi-khipu');
  });
});
