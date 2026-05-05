# Changesets

This directory contains [Changesets](https://github.com/changesets/changesets) — small Markdown files that describe a single release-worthy change.

## Workflow

After making a change that affects users (new feature, bug fix, breaking change), run:

```bash
pnpm changeset
```

The CLI asks:
1. Which packages changed.
2. Whether the bump is `major` / `minor` / `patch`.
3. A human summary (one or two sentences).

It writes a file like `.changeset/orange-cats-sing.md` to this directory. **Commit it with your code change.**

## What gets shipped

When changesets are merged into `main`, GitHub Actions opens a release PR titled `chore(release): version packages`. That PR:

- Bumps versions in each affected `package.json`.
- Aggregates the changeset summaries into `CHANGELOG.md`.
- Removes the consumed `.changeset/*.md` files.

When that PR is merged, the same workflow publishes to npm.

## Linked packages

`@mcify/cli`, `@mcify/core`, and `@mcify/runtime` are **linked**: when any one of them is in a changeset, the others bump together. This prevents version skew across packages that depend on each other (`cli → runtime → core`).

## When you don't need a changeset

- Internal-only changes (build config, tests, docs, ADRs, GitHub workflows).
- Renames of private types or files.
- Fixes that don't reach a public API.

If you're not sure, add one anyway.

## Pre-release

The first releases use the `alpha` dist-tag. Don't run `pnpm changeset pre exit` until V1 ships.
