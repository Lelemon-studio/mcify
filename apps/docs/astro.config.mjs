// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLlmsTxt from 'starlight-llms-txt';

const REPO = 'https://github.com/Lelemon-studio/mcify';

export default defineConfig({
  site: 'https://docs.mcify.dev',
  integrations: [
    starlight({
      title: 'mcify',
      description:
        'Open-source platform that exposes any API as an MCP server. CLI-first, type-safe, edge-deployable.',
      logo: { src: './src/assets/logo.svg', replacesTitle: false },
      // Starlight 0.32 expects a record keyed by provider id.
      social: { github: REPO },
      editLink: { baseUrl: `${REPO}/edit/main/apps/docs/` },
      lastUpdated: true,
      favicon: '/favicon.svg',
      head: [
        // Theme color matches the brand accent so mobile chrome picks it up.
        { tag: 'meta', attrs: { name: 'theme-color', content: '#0a0a0a' } },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/favicon.svg' } },

        // Open Graph — these are page-defaults; Starlight's per-page frontmatter
        // overrides title/description automatically.
        { tag: 'meta', attrs: { property: 'og:type', content: 'website' } },
        { tag: 'meta', attrs: { property: 'og:site_name', content: 'mcify docs' } },
        { tag: 'meta', attrs: { property: 'og:locale', content: 'en_US' } },
        { tag: 'meta', attrs: { property: 'og:image', content: 'https://docs.mcify.dev/og.png' } },
        { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
        { tag: 'meta', attrs: { property: 'og:image:type', content: 'image/png' } },
        { tag: 'meta', attrs: { property: 'og:image:alt', content: 'mcify docs' } },

        // Twitter
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
        {
          tag: 'meta',
          attrs: { name: 'twitter:image', content: 'https://docs.mcify.dev/og.png' },
        },

        // Discoverability for AI agents — every page is also available as raw
        // markdown by appending `.md` (handled by starlight-llms-txt). The full
        // bundle lives at /llms-full.txt.
        {
          tag: 'link',
          attrs: { rel: 'alternate', type: 'text/markdown', href: '/llms-full.txt' },
        },
      ],
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        {
          label: 'Start',
          items: [
            { label: 'What is mcify', slug: 'start/what-is-mcify' },
            { label: 'Install', slug: 'start/install' },
            { label: 'Your first MCP server', slug: 'start/first-server' },
            { label: 'Connect to Claude / Cursor / agents', slug: 'start/connect-clients' },
          ],
        },
        {
          label: 'Concepts',
          items: [
            { label: 'Tools', slug: 'concepts/tools' },
            { label: 'Resources', slug: 'concepts/resources' },
            { label: 'Prompts', slug: 'concepts/prompts' },
            { label: 'Auth', slug: 'concepts/auth' },
            { label: 'Middleware', slug: 'concepts/middleware' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Creating effective tools', slug: 'guides/creating-effective-tools' },
            { label: 'Antipatterns to avoid', slug: 'guides/antipatterns' },
            { label: 'From OpenAPI / microservices', slug: 'guides/from-openapi' },
            { label: 'Testing without the network', slug: 'guides/testing' },
            { label: 'Observability + logging', slug: 'guides/observability' },
          ],
        },
        {
          label: 'AI prompts',
          collapsed: false,
          items: [
            { label: 'How to use these', slug: 'prompts/how-to-use' },
            { label: 'Add a tool to my server', slug: 'prompts/add-tool' },
            { label: 'Wrap an API as MCP', slug: 'prompts/wrap-api' },
            { label: 'Debug a misbehaving tool', slug: 'prompts/debug-tool' },
            { label: 'Migrate to multi-spec', slug: 'prompts/migrate-multispec' },
          ],
        },
        {
          label: 'Deploy',
          items: [
            { label: 'Overview', slug: 'deploy/overview' },
            { label: 'Cloudflare Workers', slug: 'deploy/cloudflare' },
            { label: 'Vercel Edge', slug: 'deploy/vercel' },
            { label: 'Fly.io', slug: 'deploy/fly' },
            { label: 'Railway', slug: 'deploy/railway' },
            { label: 'Docker', slug: 'deploy/docker' },
            { label: 'Kubernetes (Helm)', slug: 'deploy/kubernetes' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'CLI', slug: 'reference/cli' },
            { label: '@mcify/core', slug: 'reference/core' },
            { label: '@mcify/runtime', slug: 'reference/runtime' },
            { label: 'Schema helpers', slug: 'reference/schema' },
          ],
        },
      ],
      plugins: [
        starlightLlmsTxt({
          projectName: 'mcify',
          description:
            'Open-source platform that exposes any API as an MCP server. CLI-first, type-safe (Zod end-to-end), deployable to Cloudflare Workers / Vercel Edge / Fly / Railway / Docker. Apache 2.0.',
          details: [
            'Three packages on npm: `@mcify/cli`, `@mcify/core`, `@mcify/runtime`. Plus `@mcify/inspector` (local web UI).',
            'Repo: https://github.com/Lelemon-studio/mcify',
          ].join(' '),
          // Promote the AI-relevant pages so they land at the top of the
          // index when an LLM scrolls through llms.txt.
          promote: [
            'start/what-is-mcify',
            'start/install',
            'start/first-server',
            'concepts/tools',
            'guides/creating-effective-tools',
            'guides/antipatterns',
            'prompts/how-to-use',
          ],
          // The deploy section is long and detail-heavy — keep it out of
          // llms-small.txt so smaller-context models don't drown in
          // platform-specific minutiae.
          exclude: ['deploy/**'],
          // Default minify is fine — Starlight's chrome (nav, ToC,
          // breadcrumbs) is already stripped. The plugin's selector parser
          // doesn't accept nested combinators here, so we don't add custom
          // ones.
        }),
      ],
    }),
  ],
});
