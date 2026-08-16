#!/usr/bin/env node
// Applies `publishConfig` manifest overrides to a package.json in place.
//
// npm's `publish`/`stage publish` treats `publishConfig` as publish *config*
// (access, tag, registry) — it does NOT override manifest fields like `main`,
// `types`, or `exports`. lerna-lite does apply these overrides (pnpm-style),
// but it can't do staged publishing. This script replicates lerna-lite's
// override layer so we can use `npm stage publish` directly.
//
// The list of overridable fields matches lerna-lite / pnpm:
//   https://github.com/lerna-lite/lerna-lite/blob/main/packages/publish/README.md#publishconfig-overrides
//
// Usage: node scripts/apply-publishconfig.mjs [path/to/package.json]
//   defaults to ./package.json

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OVERRIDE_FIELDS = [
  'bin',
  'browser',
  'cpu',
  'esnext',
  'es2015',
  'exports',
  'imports',
  'libc',
  'main',
  'module',
  'os',
  'type',
  'types',
  'typings',
  'typesVersions',
  'umd:main',
  'unpkg',
];

const target = resolve(process.argv[2] ?? 'package.json');
const raw = readFileSync(target, 'utf8');
const pkg = JSON.parse(raw);
const publishConfig = pkg.publishConfig ?? {};

let changed = false;
for (const field of OVERRIDE_FIELDS) {
  if (field in publishConfig) {
    pkg[field] = publishConfig[field];
    changed = true;
  }
}

if (changed) {
  writeFileSync(target, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`apply-publishconfig: rewrote manifest fields in ${target}`);
} else {
  console.log(`apply-publishconfig: no overrides to apply in ${target}`);
}
