---
description: Walk the user through creating a Changeset for the current branch's diff.
---

Help the user declare a release for the changes on the current branch.

1. Read `git status` and `git diff main..HEAD --stat` to see what changed.
2. Identify which `@mcify/*` packages are affected:
   - `packages/core/**` → `@mcify/core`
   - `packages/runtime/**` → `@mcify/runtime`
   - `packages/cli/**` → `@mcify/cli`
   - Cross-package or workspace-only changes might not need a changeset (build config, tests, docs, ADRs, GitHub workflows).
3. For each affected package, decide the bump:
   - **patch** — bug fix, no API change, no behavior surprises.
   - **minor** — new feature, additive API, backwards-compatible.
   - **major** — breaking change. (Until V1 ships, we should only bump minor under the alpha pre-release tag — the alpha workflow keeps users opt-in via `@alpha` dist-tag.)
4. Write a 1–3 sentence summary in present tense, focused on the *why* and the user-visible impact.
5. Create `.changeset/<descriptive-slug>.md` with this format:

   ```md
   ---
   '@mcify/<package>': <patch|minor|major>
   ---

   <summary>
   ```

   For multiple packages, list each on its own frontmatter line.

6. Stage the changeset file and commit it with `chore(release): add changeset for <slug>`.
7. **Stop** before pushing or publishing. The user pushes; CI handles versioning and publishing via `changesets/action`.

Read `.changeset/README.md` if any of the above is unclear.
