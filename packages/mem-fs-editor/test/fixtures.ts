import path from 'node:path';

// This file is not covered by any tsconfig `include` (only *.spec.ts/*.test.ts
// are), so type-aware linting resolves imports and globals to error types.
// The code type-checks correctly under `yarn tsc`.
// oxlint-disable typescript/no-unsafe-return, typescript/no-unsafe-call, typescript/no-unsafe-member-access
export const getFixture = (...fixture: string[]): string =>
  path.join(import.meta.dirname, 'fixtures', ...fixture);
