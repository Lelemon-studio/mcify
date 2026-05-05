# mcify-web

Landing site for [mcify.dev](https://mcify.dev). Astro 5 + Tailwind 3, deploys to Cloudflare Pages.

## Develop

```bash
pnpm install
pnpm --filter mcify-web dev
# → http://localhost:4321
```

## Build

```bash
pnpm --filter mcify-web build
# → dist/
```

## Deploy

GitHub Actions workflow `.github/workflows/deploy-web.yml` deploys to Cloudflare Pages on every push to `main`. Requires the repo secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.

## Replace placeholder assets

The hero shows an inline SVG mockup of the inspector. To use a real screenshot:

1. Capture the inspector at `:3001` (1280×800 looks good).
2. Save as `public/screenshots/inspector.png`.
3. In `src/components/Showcase.astro`, replace `<InspectorMockup />` with `<img src="/screenshots/inspector.png" alt="..." class="rounded-xl border border-ink-800" />`.

Same for an `og.png` social card (1200×630) → `public/og.png`.
