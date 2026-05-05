import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The `templates/` directory ships sample projects (with their own tests)
    // to be copied by `mcify init`. Those test files are template content,
    // not part of the CLI's own suite — exclude them from discovery.
    exclude: ['**/node_modules/**', '**/dist/**', 'templates/**'],
  },
});
