// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://mcify.dev',
  integrations: [tailwind({ applyBaseStyles: false })],
  build: { assets: 'assets' },
});
