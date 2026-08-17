import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = import.meta.dirname;

export const getFixture = (...fixture) => join(__dirname, 'fixtures', ...fixture);
