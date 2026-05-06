// Generate the social card at apps/web/public/og.png from a static SVG source.
// Run with `pnpm --filter mcify-web og` after editing the SVG; commit the PNG.
//
// Why this approach: Twitter / Facebook / LinkedIn want raster (PNG/JPG) for
// social previews. The PNG is committed so the build doesn't need to render it
// every time — re-run only when the SVG changes.

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
  // System sans-serif fallback covers Linux CI runners. The SVG itself
  // declares system-ui first; resvg falls back to whatever the host has.
  font: { loadSystemFonts: true, defaultFontFamily: 'sans-serif' },
});

const png = resvg.render().asPng();
await fs.writeFile(outPath, png);

const sizeKB = (png.byteLength / 1024).toFixed(1);
process.stdout.write(`✓ ${path.relative(process.cwd(), outPath)} (${sizeKB} KB, 1200×630)\n`);
