---
description: Run the full quality gate (typecheck, lint, test) and report.
---

Run the full quality gate in order. Stop at the first failure and surface the exact error.

1. `pnpm typecheck` — must succeed before continuing.
2. `pnpm lint` — must pass with `--max-warnings=0`.
3. `pnpm test` — all tests must pass.

If a step fails, stop and surface:
- Which step failed.
- The first 20 lines of error output (or fewer if shorter).
- A one-line guess at the likely cause (`tsc` errors, lint rule name, failing test file).

If all three pass, report a one-line summary: `<step1 OK> · <step2 OK> · <step3 OK> · N tests passing`.

Do not run `pnpm build` — that's `mcify build`-style and slower; use it explicitly when releasing or smoke-testing.
