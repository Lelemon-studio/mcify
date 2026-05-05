// @ts-check

/**
 * @type {import('@commitlint/types').UserConfig}
 *
 * Commits follow Conventional Commits. The Release workflow (Changesets)
 * relies on the `type(scope)` shape, so the lint is enforced at commit time
 * via husky's commit-msg hook.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'chore',
        'refactor',
        'test',
        'perf',
        'ci',
        'build',
        'style',
        'revert',
      ],
    ],
    // Subjects are sometimes a sentence — allow up to 100 chars.
    'header-max-length': [2, 'always', 100],
    'subject-case': [0],
    'body-max-line-length': [0],
  },
};
