import { promises as fs } from 'node:fs';
import path from 'node:path';
import { log } from '../logger.js';
import { getTemplatesRoot } from '../paths.js';
import { getString, type ParsedArgs } from '../args.js';
import { fileExists, isErrnoException } from '../utils/fs.js';

const TEMPLATE_PLACEHOLDER = /\{\{(\w+)\}\}/g;

const listTemplates = async (root: string): Promise<string[]> => {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (e) {
    // A missing templates dir is the only "this is fine, no templates" case.
    // Anything else (EACCES, EIO, ENOTDIR) is a real problem we want to surface.
    if (isErrnoException(e) && e.code === 'ENOENT') return [];
    throw e;
  }
};

const renameSpecial = (name: string): string => {
  // Files starting with `_` map to `.` so npm publish doesn't drop dotfiles.
  if (name === '_gitignore') return '.gitignore';
  if (name === '_npmrc') return '.npmrc';
  return name;
};

const renderTemplateString = (content: string, variables: Record<string, string>): string =>
  content.replace(TEMPLATE_PLACEHOLDER, (match, key: string) => variables[key] ?? match);

const isLikelyText = (filename: string): boolean => {
  const ext = path.extname(filename).toLowerCase();
  return [
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.json',
    '.md',
    '.mdx',
    '.txt',
    '.yml',
    '.yaml',
    '.toml',
    '.css',
    '.html',
    '.gitignore',
    '.npmrc',
    '.editorconfig',
    '',
  ].includes(ext);
};

const copyTemplate = async (
  src: string,
  dst: string,
  variables: Record<string, string>,
): Promise<void> => {
  await fs.mkdir(dst, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstName = renameSpecial(entry.name);
    const dstPath = path.join(dst, dstName);
    if (entry.isDirectory()) {
      await copyTemplate(srcPath, dstPath, variables);
      continue;
    }
    if (isLikelyText(entry.name)) {
      const content = await fs.readFile(srcPath, 'utf-8');
      await fs.writeFile(dstPath, renderTemplateString(content, variables), 'utf-8');
    } else {
      await fs.copyFile(srcPath, dstPath);
    }
  }
};

export interface InitOptions {
  /** Project name (also default directory name). */
  name: string;
  /** Template name. Defaults to `from-scratch`. */
  template?: string;
  /** Override target directory. Defaults to `./<name>`. */
  dir?: string;
  /** Where to find templates. Defaults to {@link getTemplatesRoot}. */
  templatesRoot?: string;
}

export const init = async (options: InitOptions): Promise<{ dir: string }> => {
  const template = options.template ?? 'from-scratch';
  const templatesRoot = options.templatesRoot ?? getTemplatesRoot();
  const templateDir = path.join(templatesRoot, template);
  const dir = path.resolve(process.cwd(), options.dir ?? options.name);

  if (!(await fileExists(templateDir))) {
    const available = await listTemplates(templatesRoot);
    throw new Error(
      `Unknown template "${template}". Available: ${available.join(', ') || '(none)'}`,
    );
  }

  if (await fileExists(dir)) {
    throw new Error(`Directory already exists: ${dir}`);
  }

  await copyTemplate(templateDir, dir, { name: options.name });
  return { dir };
};

export const runInit = async (args: ParsedArgs): Promise<void> => {
  const name = args.positional[1];
  if (!name) {
    log.error('mcify init: <name> is required');
    log.hint('Usage: mcify init <name> [--template from-scratch] [--dir ./path]');
    process.exit(1);
  }

  const template = getString(args, 'template');
  const dir = getString(args, 'dir');

  try {
    const result = await init({ name, ...(template ? { template } : {}), ...(dir ? { dir } : {}) });
    log.success(`Created ${path.relative(process.cwd(), result.dir) || result.dir}`);
    log.info('Next steps:');
    log.hint(`  cd ${path.relative(process.cwd(), result.dir) || result.dir}`);
    log.hint('  pnpm install');
    log.hint('  pnpm dev');
  } catch (e) {
    log.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
};
