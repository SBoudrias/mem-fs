import xo from 'eslint-config-xo';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  ...xo,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    files: ['**/tsconfig.json'],
    language: 'json/jsonc',
    languageOptions: {
      allowTrailingCommas: true,
    },
  },
  {
    ignores: [
      '.git',
      '.git/**',
      'node_modules',
      'node_modules/**',
      'coverage',
      'coverage/**',
      '.yarn',
      '.yarn/**',
      '.turbo/**',
      'packages/*/dist/**',
      'packages/*/node_modules/**',
      'tools/*/dist/**',
      'tools/*/node_modules/**',
    ],
  },
);
