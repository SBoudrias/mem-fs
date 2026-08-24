import path from 'node:path';

export const getFixture = (...fixture: string[]): string =>
  path.join(import.meta.dirname, 'fixtures', ...fixture);
