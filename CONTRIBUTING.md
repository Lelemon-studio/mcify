# Contributing to mcify

Thanks for your interest in mcify. This document covers how to set up the project, the conventions we follow, and how to submit changes.

## Code of conduct

By participating in this project, you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md). Please read it before contributing.

## Prerequisites

- **Node.js** 20+ (LTS)
- **pnpm** 9+ (`npm install -g pnpm`)
- **Bun** 1.1+ for the CLI package (`curl -fsSL https://bun.sh/install | bash`)
- **Git**

## Setup

```bash
git clone git@github.com:Lelemon-studio/mcify.git
cd mcify
pnpm install
pnpm build
pnpm test
```

## Repo layout

```
mcify/
├── packages/
│   ├── core/             Builder library
│   ├── cli/              Command-line tool
│   ├── runtime/          MCP server runtime
│   ├── inspector/        Local dashboard
│   └── examples/         Dogfooded connector examples
├── apps/
│   └── docs/             Public docs site (mcify.dev)
└── .github/              CI workflows + templates
```

Each package is a standalone npm package under the `@mcify/*` scope, managed with pnpm workspaces.

## Conventions

### Code

- **Language:** TypeScript only (strict mode, no `any`).
- **Identifiers:** English (variables, functions, types, file names).
- **Schema validation:** Zod at runtime boundaries.
- **Logging:** `@mcify/core/logger` (Pino-based). No `console.log` in committed code.
- **No type assertions** (`as`) without an inline comment explaining why.

### Documentation

- **Public docs (`apps/docs`, READMEs):** English by default. Spanish translation accepted alongside.
- **Code comments:** only when the *why* is non-obvious. Default to no comments.

### Commits

We use [Conventional Commits](https://www.conventionalcommits.org):

```
type(scope): short description

Optional longer body explaining the why.
```

Common types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `ci`.

Scopes match package names (e.g. `core`, `cli`, `runtime`, `inspector`, `docs`) or repo-wide concerns (`build`, `deps`, `release`).

Example:

```
feat(cli): add `mcify generate` for client type generation

Generates a typed SDK from the server schema using Zod-to-TypeScript
inference. Closes #42.
```

### Branches and PRs

- Branch from `main`. Use descriptive names: `feat/cli-generate`, `fix/runtime-stdio-eof`.
- One logical change per PR. Smaller is better.
- Fill out the PR template (see `.github/PULL_REQUEST_TEMPLATE.md`).
- Link issues with `Closes #N` or `Refs #N`.
- All checks (lint, typecheck, tests, build) must pass.
- At least one approving review is required to merge.
- Squash and merge by default.

## Testing

```bash
# Run all tests
pnpm test

# Run tests for a specific package
pnpm --filter @mcify/core test

# Run with coverage
pnpm test --coverage
```

We aim for >= 70% coverage in `packages/core` and `packages/runtime`. Add tests for any new behavior or bug fix.

## Linting and formatting

```bash
pnpm lint        # Check
pnpm lint:fix    # Auto-fix where possible
pnpm format      # Run Prettier
```

CI rejects PRs with lint or format violations.

## Documentation changes

Public docs live in `apps/docs`. Run locally with:

```bash
pnpm --filter docs dev
```

If your change adds a public API, update the relevant guide and the API reference.

## Releasing

Releases are managed by maintainers using Changesets. See [`docs/releasing.md`](./apps/docs/src/content/docs/releasing.md) (coming soon).

## Reporting bugs

Open a [GitHub issue](https://github.com/Lelemon-studio/mcify/issues/new/choose) using the bug report template. Include:

- mcify version
- Node / Bun version
- OS
- Reproduction steps
- Expected vs. actual behavior

## Proposing features

For non-trivial features, open a discussion or issue first to align on scope before writing code. We want your time well spent.

## Asking questions

Use [GitHub Discussions](https://github.com/Lelemon-studio/mcify/discussions) for usage questions. The issue tracker is for bugs and concrete proposals.

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
