# Compat harness

Backward compatibility tests: runs the pinned **published** versions of
mem-fs-editor (see [`matrix.json`](./matrix.json)) against a tarball of mem-fs
packed from the current repository head.

This guards the `mem-fs: >=4.0.0` peer dependency promise made by
mem-fs-editor: a new mem-fs release must not break the older mem-fs-editor
versions that consumers (e.g. yeoman-generator) still pin.

## Run

```sh
yarn workspace @repo/compat test
# or
node tools/compat/run.mjs
```

## How it works

1. Builds `packages/mem-fs` (`dist/`) and packs it with `npm pack`.
2. Patches the packed manifest to apply `publishConfig` — `npm pack` doesn't do
   it, but lerna does at publish time; the resulting tarball matches the
   published artifact.
3. For each `matrix.json` entry, scaffolds a throwaway project in the OS
   temp dir (outside the repo, so workspaces can't influence resolution) that
   depends on the mem-fs tarball plus the pinned published packages, then runs
   the shared suite in `tests/`.

   `npm install --legacy-peer-deps` is essential: older published editors
   declare `mem-fs: ^4.0.0` as a peer and npm would otherwise install a nested
   mem-fs@4 — making the tests pass against the wrong package.
   `tests/compat-resolution.spec.ts` guards this at runtime.

4. Fails if any matrix entry's tests fail.

## Maintenance

- New consumer to cover? Add an entry to `matrix.json`. The suite only requires
  `mem-fs-editor` to be present; additional packages can be added per entry.
- New editor major? Bump the pinned versions (or add a new entry) — keep at
  least the oldest supported line and `latest` covered.
