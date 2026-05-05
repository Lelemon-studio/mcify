# 0002. Changesets for monorepo releases

- **Status**: accepted
- **Date**: 2026-05-05

## Context

mcify ships three linked packages on npm: `@mcify/cli`, `@mcify/core`, `@mcify/runtime`. They depend on each other (cli → runtime → core), so version skew across them is a real failure mode for users.

We need a release process that:
- Lets contributors declare a version bump as part of the PR, not as a separate ritual.
- Aggregates per-PR summaries into `CHANGELOG.md` automatically.
- Publishes to npm without a maintainer manually running `npm publish` three times.
- Supports pre-release tags (`alpha`, `beta`) that don't pollute the default `latest` dist-tag.

Manual versioning across three `package.json` files breaks one of those goals every release.

## Decision

We use [Changesets](https://github.com/changesets/changesets) with the `changesets/action` GitHub Action. Configuration:

- The three `@mcify/*` packages are `linked` so they bump together when any one of them is in a changeset.
- The default branch is `main`. The action opens a "Version packages" PR each time changesets exist on main; merging that PR triggers `changeset publish`.
- Changelog format: `@changesets/changelog-github` so entries auto-link PRs and contributors.
- Pre-release: started in `alpha` mode. First release is `0.0.1-alpha.0` under the `@alpha` dist-tag. We exit pre mode before V1.0.0.

`prepublishOnly: pnpm build` is set on each publishable package as a safety net so a stale `dist/` never reaches npm.

## Alternatives considered

- **Lerna**: legacy, slower, npm-first. Most modern TS monorepos have moved off it.
- **Manual versioning + `release-please`**: works but doesn't match well to monorepos with linked packages — release-please assumes one project per repo. Lost.
- **Custom `release.sh`**: tempting in week one, miserable in month six. Lost.

## Consequences

- **Becomes easier**: contributors don't think about versioning; CI handles npm; CHANGELOG.md is honest.
- **Becomes harder**: nothing immediately. The cost is one extra file (`.changeset/<slug>.md`) per user-facing PR.
- **What we're betting on**: Changesets stays maintained. It's owned by Atlassian's team and used by Cal.com, Astro, tRPC, Remix, etc. — bus factor is comfortable.
- **Reversibility**: medium. Switching off Changesets later means reading the existing changesets, manually maintaining `CHANGELOG.md`, and losing the version PR ergonomics. Doable but annoying.
