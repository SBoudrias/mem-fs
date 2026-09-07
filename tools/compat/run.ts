#!/usr/bin/env node
/* oxlint-disable eslint/no-console -- CLI script */
/**
 * Backward compatibility harness.
 *
 * For every entry in matrix.json, scaffolds an isolated throwaway project that
 * installs:
 *   - mem-fs, from a tarball packed from this repository (head), and
 *   - the pinned published versions of mem-fs-editor (or any other consumer
 *     listed in matrix.json),
 * then runs the shared test suite (tests/*.spec.ts) inside it.
 *
 * The isolated project is created outside the repository tree on purpose:
 * the monorepo workspaces must not influence resolution, and the mem-fs
 * tarball must be the publish artifact (publishConfig applied, dist/ built)
 * rather than the workspace source.
 *
 * `npm install --legacy-peer-deps` is essential: older published mem-fs-editor
 * versions declare `mem-fs: ^4.0.0` as a peer dependency, and npm would
 * otherwise silently install a nested mem-fs@4 next to the head tarball,
 * making the tests pass against the wrong mem-fs. The resolution guard
 * (tests/compat-resolution.spec.ts) double-checks this at runtime.
 *
 * Run with a Node.js runtime with native type stripping (>= 22.18).
 */

import { execFileSync } from 'node:child_process';
import fs, { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type MatrixEntry = Record<string, unknown>;

interface MemFsManifest {
  version: string;
  publishConfig?: Record<string, unknown>;
}

interface PackedMemFs {
  tarball: string;
  version: string;
}

const compatDir = import.meta.dirname;
const repoRoot = path.resolve(compatDir, '../..');
const memFsPackageDir = path.join(repoRoot, 'packages', 'mem-fs');

function run(command: string, args: string[], options: { cwd?: string } = {}): void {
  execFileSync(command, args, { stdio: 'inherit', ...options });
}

function isMemFsManifest(value: unknown): value is MemFsManifest {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    typeof value.version === 'string'
  );
}

function readMemFsManifest(filePath: string): MemFsManifest {
  const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!isMemFsManifest(parsed)) {
    throw new TypeError(`Invalid manifest in ${filePath}`);
  }

  return parsed;
}

function isMatrixEntry(value: unknown): value is MatrixEntry {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readMatrix(filePath: string): MatrixEntry[] {
  const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(parsed)) {
    throw new TypeError(`Invalid matrix in ${filePath}`);
  }

  const entries = parsed.filter((entry) => isMatrixEntry(entry));
  if (entries.length !== parsed.length) {
    throw new TypeError(`Invalid matrix in ${filePath}`);
  }

  return entries;
}

/** npm pack does not apply `publishConfig`; lerna does it when publishing. */
function applyPublishConfig(manifest: MemFsManifest): Record<string, unknown> {
  const { publishConfig, ...rest } = manifest;
  return { ...rest, ...(publishConfig ? { ...publishConfig, access: undefined } : {}) };
}

/** Build and pack mem-fs into a tarball matching the published artifact. */
function packMemFs(stagingDir: string): PackedMemFs {
  const memFsManifest = readMemFsManifest(path.join(memFsPackageDir, 'package.json'));

  console.log(`# Building mem-fs@${memFsManifest.version} (dist/)...`);
  run('yarn', ['exec', 'tsc', '-p', 'packages/mem-fs'], { cwd: repoRoot });

  console.log('# Packing mem-fs...');
  const rawPackDir = path.join(stagingDir, 'raw-pack');
  mkdirSync(rawPackDir);
  run('npm', ['pack', '--silent', '--pack-destination', rawPackDir], {
    cwd: memFsPackageDir,
  });

  const rawTarball = readdirSync(rawPackDir).find((file) => file.endsWith('.tgz'));
  if (rawTarball === undefined) {
    throw new Error('npm pack did not produce a tarball');
  }

  run('tar', ['-xzf', path.join(rawPackDir, rawTarball), '-C', stagingDir]);

  // The tarball root is a `package/` directory; patch its manifest so imports
  // resolve to the built files exactly like a released version would.
  const packedManifestPath = path.join(stagingDir, 'package', 'package.json');
  const packedManifest = readMemFsManifest(packedManifestPath);
  writeFileSync(
    packedManifestPath,
    `${JSON.stringify(applyPublishConfig(packedManifest), null, 2)}\n`,
  );

  const tarball = path.join(stagingDir, `mem-fs-${memFsManifest.version}.tgz`);
  run('tar', ['-czf', tarball, 'package'], { cwd: stagingDir });
  return { tarball, version: memFsManifest.version };
}

function scaffoldProject(entry: MatrixEntry, memFs: PackedMemFs): string {
  const slug = Object.entries(entry)
    .filter(([name]) => name !== '$comment')
    .map(([name, version]) => `${name.replaceAll('/', '-')}-${String(version)}`)
    .join('+');
  const projectDir = mkdtempSync(path.join(os.tmpdir(), `mem-fs-compat-${slug}-`));

  const dependencies: Record<string, string> = {
    ...Object.fromEntries(Object.entries(entry).filter(([name]) => name !== '$comment')),
    'mem-fs': path.relative(projectDir, memFs.tarball),
  };
  const manifest = {
    name: 'mem-fs-compat-fixture',
    private: true,
    type: 'module',
    scripts: {
      test: 'vitest run',
    },
    dependencies,
    devDependencies: { vitest: '^4.0.0' },
  };
  writeFileSync(
    path.join(projectDir, 'package.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  fs.cpSync(path.join(compatDir, 'tests'), path.join(projectDir, 'tests'), {
    recursive: true,
  });
  // Runtime metadata the tests use to guard the fixture itself.
  writeFileSync(
    path.join(projectDir, 'tests', 'compat-fixture.json'),
    `${JSON.stringify({ memFsVersion: memFs.version }, null, 2)}\n`,
  );

  return projectDir;
}

function runProject(projectDir: string): void {
  console.log(`\n# Installing fixture in ${projectDir}`);
  run('npm', ['install', '--no-fund', '--no-audit', '--legacy-peer-deps'], {
    cwd: projectDir,
  });
  console.log('# Running compat tests...');
  run('npm', ['test'], { cwd: projectDir });
}

function main(): void {
  const matrix = readMatrix(path.join(compatDir, 'matrix.json'));
  const stagingDir = mkdtempSync(path.join(os.tmpdir(), 'mem-fs-compat-pack-'));
  const memFs = packMemFs(stagingDir);

  const failures: string[] = [];
  for (const entry of matrix) {
    const label = JSON.stringify(entry);
    console.log(`\n=== Compatibility: ${label}`);
    const projectDir = scaffoldProject(entry, memFs);
    try {
      runProject(projectDir);
      console.log(`\u2713 ${label}`);
    } catch (error) {
      failures.push(label);
      console.error(
        `\u2717 ${label}\n${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (failures.length > 0) {
    console.error(`\nCompat matrix failures (${failures.length}):`);
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }

    process.exitCode = 1;
  }
}

// oxlint-disable-next-line vitest/require-hook -- CLI entry point, not a test file
main();
