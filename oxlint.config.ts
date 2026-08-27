import { defineConfig } from 'oxlint';

export default defineConfig({
  options: {
    typeAware: true,
    reportUnusedDisableDirectives: 'error',
  },
  plugins: ['typescript', 'unicorn', 'oxc', 'import', 'promise', 'node', 'vitest'],
  categories: {
    correctness: 'error',
    suspicious: 'error',
    pedantic: 'error',
    perf: 'error',
    style: 'error',
    restriction: 'error',
    nursery: 'error',
  },
  env: {
    builtin: true,
    es2024: true,
    node: true,
  },
  ignorePatterns: [
    'coverage/**',
    '.yarn/**',
    '.turbo/**',
    'packages/*/dist/**',
    'packages/*/node_modules/**',
    'tools/*/dist/**',
    'tools/*/node_modules/**',
  ],
  rules: {
    // --- Disabled: would require rewriting the codebase for no correctness gain ---

    // Style preferences that fight the established codebase style
    'eslint/sort-imports': 'off',
    'eslint/sort-keys': 'off',
    'eslint/no-magic-numbers': 'off',
    'eslint/no-ternary': 'off',
    'eslint/id-length': 'off',
    'eslint/no-undefined': 'off',
    'eslint/init-declarations': 'off',
    'eslint/func-style': 'off',
    'eslint/no-inline-comments': 'off',
    'eslint/no-underscore-dangle': 'off',
    'eslint/max-lines': 'off',
    'eslint/max-lines-per-function': 'off',
    'eslint/max-statements': 'off',
    'eslint/max-params': 'off',
    // Library design: Node.js API, sync entry points, named+default exports
    'import/no-nodejs-modules': 'off',
    'import/no-relative-parent-imports': 'off',
    'import/no-named-export': 'off',
    'import/no-default-export': 'off',
    'import/prefer-default-export': 'off',
    'import/group-exports': 'off',
    'import/exports-last': 'off',
    'import/max-dependencies': 'off',
    // Cycles are type-only (actions import interfaces from the index barrel)
    'import/no-cycle': 'off',
    // Sync APIs are this library's purpose
    'node/no-sync': 'off',
    // Banning async/await, optional chaining and spread is not practical
    'oxc/no-async-await': 'off',
    'oxc/no-optional-chaining': 'off',
    'oxc/no-rest-spread-properties': 'off',
    // Actions are exported functions using a typed `this` context by design
    'oxc/no-this-in-exported-function': 'off',
    // Wrapping callback APIs legitimately needs the Promise constructor
    'promise/avoid-new': 'off',
    // Node Transform / chmod APIs are callback- and bit-mask-based
    'promise/prefer-await-to-callbacks': 'off',
    'promise/prefer-await-to-then': 'off',
    'promise/no-callback-in-promise': 'off',
    'promise/always-return': 'off',
    'node/callback-return': 'off',
    'eslint/no-bitwise': 'off',
    // ReadonlyDeep-style parameters would require rewriting every signature
    'typescript/prefer-readonly-parameter-types': 'off',
    // vinyl's API uses `null` contents
    'unicorn/no-null': 'off',
    // Interfaces are required for the intentional declaration merging in
    // mem-fs-editor's index.ts, so no interface-vs-type enforcement
    'typescript/consistent-type-definitions': 'off',
    // Autofix capitalizes continuation sentences mid-comment
    'eslint/capitalized-comments': 'off',
    // Wrapping cached promises in async changes promise identity
    'typescript/promise-function-async': 'off',
    // Codebase style is inline `type` specifiers; tsc elides type-only
    // imports, and forcing top-level `import type` creates duplicate imports
    'typescript/no-import-type-side-effects': 'off',
    // Overlaps with typescript/consistent-type-imports (inline fixStyle)
    'import/consistent-type-specifier-style': 'off',
    // Test style: hooks, explicit vitest imports and plain assertions are fine
    'vitest/prefer-expect-assertions': 'off',
    'vitest/require-test-timeout': 'off',
    'vitest/no-hooks': 'off',
    'vitest/no-importing-vitest-globals': 'off',
    'vitest/require-to-throw-message': 'off',
    'vitest/no-conditional-in-test': 'off',
    'vitest/no-conditional-expect': 'off',
    'vitest/prefer-to-be-truthy': 'off',
    'vitest/prefer-to-be-falsy': 'off',
    'vitest/prefer-strict-boolean-matchers': 'off',
    // Autofix strengthens assertion semantics (broke a commit spec)
    'vitest/prefer-called-with': 'off',
    'vitest/prefer-called-exactly-once-with': 'off',
    'vitest/prefer-called-times': 'off',
    'vitest/prefer-strict-equal': 'off',
    // Store/editor classes do not use explicit member accessibility
    'typescript/explicit-member-accessibility': 'off',

    // --- Configured to match the established style ---

    // One declaration per statement (XO-compatible direction)
    'eslint/one-var': ['error', 'never'],
    'eslint/no-plusplus': ['error', { allowForLoopAfterthoughts: true }],
    // `== null` / `!= null` is the one allowed loose equality: it matches both
    // `null` and `undefined` without distinguishing them.
    'eslint/eqeqeq': ['error', 'always', { null: 'ignore' }],
    'eslint/no-eq-null': 'off',
    // Mixed imports use inline `type` specifiers; all-type imports use
    // top-level `import type` (enforced by no-import-type-side-effects)
    'typescript/consistent-type-imports': [
      'error',
      { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
    ],
    // Exported functions need return types; inline callbacks don't
    'typescript/explicit-function-return-type': [
      'error',
      { allowExpressions: true, allowTypedFunctionExpressions: true },
    ],
    // `_`-prefixed names mark intentionally unused variables
    'typescript/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
    // Tests live in `.spec.ts` and `.test.ts` files
    'vitest/consistent-test-filename': [
      'error',
      { pattern: String.raw`.*\.(test|spec)\.ts` },
    ],
  },
  overrides: [
    {
      // Plain Node scripts: legitimate console output, no type information
      files: ['scripts/**/*.mjs'],
      rules: {
        'eslint/no-console': 'off',
        // Not a test file; the vitest plugin matches too broadly here
        'vitest/require-hook': 'off',
        'typescript/no-unsafe-argument': 'off',
        'typescript/no-unsafe-assignment': 'off',
        'typescript/no-unsafe-call': 'off',
        'typescript/no-unsafe-member-access': 'off',
        'typescript/no-unsafe-return': 'off',
        'typescript/strict-boolean-expressions': 'off',
      },
    },
  ],
});
