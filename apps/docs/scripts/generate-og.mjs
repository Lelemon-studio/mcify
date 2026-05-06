// Generate the docs site social card from a static SVG source.
// Run with `pnpm --filter mcify-docs og`. Commit the resulting PNG.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const here = path.dirname(fileURLToPath(import.meta.url));
const svgPath = path.join(here, 'og-source.svg');
const outPath = path.join(here, '..', 'public', 'og.png');

const svg = await fs.readFile(svgPath, 'utf-8');

const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1200 },
  font: { loadSystemFonts: true, defaultFontFamily: 'sans-serif' },
});

const png = resvg.render().asPng();
await fs.writeFile(outPath, png);

const sizeKB = (png.byteLength / 1024).toFixed(1);
process.stdout.write(`✓ ${path.relative(process.cwd(), outPath)} (${sizeKB} KB, 1200×630)\n`);
