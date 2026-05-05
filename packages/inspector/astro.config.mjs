// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  output: 'static',
  integrations: [react()],
  // The inspector is served from a Hono server at runtime — Astro just builds
  // a static bundle to be copied into the runtime's `staticRoot`.
  build: {
    assets: 'assets',
  },
  vite: {
    server: {
      proxy: {
        '/api': 'http://localhost:3001',
        '/events': {
          target: 'ws://localhost:3001',
          ws: true,
        },
      },
    },
  },
});
