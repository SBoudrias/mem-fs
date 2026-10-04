import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `tools/compat` specs are run inside isolated projects by
    // `tools/compat/run.mjs` — never as part of the monorepo test run.
    exclude: [...configDefaults.exclude, 'tools/compat/**'],
    pool: 'forks',
    coverage: {
      provider: 'v8',
      thresholds: {
        '100': true,
      },
    },
  },
});
