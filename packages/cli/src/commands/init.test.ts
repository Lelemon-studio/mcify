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
});
