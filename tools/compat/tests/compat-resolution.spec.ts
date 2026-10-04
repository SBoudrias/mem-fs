/**
 * Fixture integrity guards.
 *
 * These tests make sure the isolated project actually runs the head mem-fs
 * tarball, and that npm didn't sneak a second copy of mem-fs into the tree
 * to satisfy the pinned editor's peer dependency range.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

const fixtureContent = fs.readFileSync(
  new URL('compat-fixture.json', import.meta.url),
  'utf8',
);
const parsedFixture: unknown = JSON.parse(fixtureContent);

function fixtureVersion(value: unknown): string {
  if (typeof value === 'object' && value !== null && 'memFsVersion' in value) {
    const { memFsVersion } = value;
    if (typeof memFsVersion === 'string') {
      return memFsVersion;
    }
  }

  throw new Error('Invalid compat-fixture.json');
}

function manifestVersion(value: unknown): string {
  if (typeof value === 'object' && value !== null && 'version' in value) {
    const { version } = value;
    if (typeof version === 'string') {
      return version;
    }
  }

  throw new Error('mem-fs manifest missing version');
}

describe('fixture integrity', () => {
  it('resolves the head mem-fs tarball', () => {
    const parsedManifest: unknown = require('mem-fs/package.json');
    expect(manifestVersion(parsedManifest)).toBe(fixtureVersion(parsedFixture));
  });

  it('resolves a single mem-fs copy from mem-fs-editor (no nested peer fallback)', () => {
    const editorEntry = require.resolve('mem-fs-editor');
    const editorRequire = createRequire(editorEntry);
    const fromEditor = editorRequire.resolve('mem-fs/package.json');
    const fromTests = require.resolve('mem-fs/package.json');

    expect(fs.realpathSync(fromEditor)).toBe(fs.realpathSync(fromTests));
  });
});
