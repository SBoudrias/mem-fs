# Contributing to mem-fs

## Development setup

This is a Yarn Berry (v4) + lerna-lite + turbo monorepo. After cloning:

```sh
yarn install
```

`yarn install` automatically wires the local git hooks — the root `postinstall`
script points git at `.gitconfig`, which enables three hooks:

- **pre-commit** — runs `nano-staged` (format + lint on staged files)
- **post-checkout** — runs `yarn install`
- **pre-push** — runs `yarn pretest && yarn test`

> **Why `postinstall` and not `prepare`?** `enableScripts` is `false` in
> `.yarnrc.yml` to stop **third-party dependency** `postinstall`/`preinstall`
> scripts from running arbitrary code on your machine. Yarn still treats
> **workspace** scripts (the root and `packages/*`) as trusted project code, so
> a workspace `postinstall` runs even with `enableScripts: false` — but
> `prepare` is classified as a build script and gets blocked. That's why the
> hook-setup script lives under `postinstall`. Build tools that ship binaries
> via `optionalDependencies` (e.g. `esbuild`) keep working without any script.
>
> If a third-party dependency genuinely needs its build script, allowlist that
> one package in the root `package.json` rather than re-enabling scripts
> globally:
>
> ```json
> "dependenciesMeta": { "<trusted-pkg>": { "built": true } }
> ```

## Day-to-day commands

| Command           | What it does                                         |
| ----------------- | ---------------------------------------------------- |
| `yarn test`       | Runs vitest with coverage                            |
| `yarn vitest run` | Runs vitest without coverage (faster)                |
| `yarn pretest`    | `package lint --check`, eslint, oxfmt, tsc typecheck |
| `yarn tsc`        | Builds every package to `dist/` (turbo)              |
| `yarn eslint .`   | Lint                                                 |
| `yarn oxfmt`      | Format                                               |

## Releasing

Releases are **tag-driven and staged**. There is no npm token in CI; publishing
authenticates via npm Trusted Publishing (GitHub OIDC). Every release requires a
maintainer's 2FA approval before it goes live.

### One-time setup (already done on npmjs.com)

For each public package — [`mem-fs`](https://www.npmjs.com/package/mem-fs/access)
and [`mem-fs-editor`](https://www.npmjs.com/package/mem-fs-editor/access) — a
Trusted Publisher is configured:

- **GitHub Actions**, repo `SBoudrias/mem-fs`, workflow `publish.yaml`
- **Stage-only** — CI can `npm stage publish` but never `npm publish` directly
- **2FA required, tokens disallowed**

On GitHub, tag creation is restricted to the repo admin
([`Tags only by admins` ruleset](https://github.com/SBoudrias/mem-fs/rules)),
and [immutable releases](https://github.com/SBoudrias/mem-fs/settings) are on.

### Cut a release

Versions are managed with lerna-lite (independent mode). From a clean `main`:

```sh
git checkout main
git pull

yarn lerna version           # interactive: pick the bump per package
# → updates each package.json + CHANGELOG (conventional-changelog)
# → commits "chore(release): publish"
# → creates tags like mem-fs@4.1.6 and/or mem-fs-editor@12.0.7

git push origin main --follow-tags
```

Pushing the tag(s) triggers `.github/workflows/publish.yaml`, which runs:

1. **test** — `yarn install --immutable` + `yarn vitest run`
2. **build** — `yarn tsc`, uploads each `dist/` as an artifact
3. **publish** — checks out the repo, downloads the matching `dist/` artifact,
   and runs `npm stage publish --ignore-scripts` for the tagged package. No
   dependencies are installed in this job. Provenance is generated
   automatically via Trusted Publishing.

The package is now **staged**, not live.

### Approve the release (your 2FA step)

```sh
npm stage list                 # see what CI staged
npm stage view <stage-id>      # inspect the tarball
npm stage approve <stage-id>   # your 2FA → package goes live, provenance badge appears
```

You can also approve from the **Staged Packages** view in your npm user menu on
npmjs.com. This is the manual 2FA gate that a compromised CI run cannot fake.

### Notes

- **First publish of a brand-new package** can't use Trusted Publishing (the
  package doesn't exist on npm yet). Publish once manually with
  `npm publish --ignore-scripts --access public` (interactive 2FA), then
  configure the Trusted Publisher on npmjs.com. Every later release goes
  through the tag → stage → approve flow and gets provenance.
- **Only `mem-fs` and `mem-fs-editor` are published.** `@repo/tsconfig` and the
  root package are `private: true`.
- **Dependency cooldown** is set to 3 days (`npmMinimalAgeGate: 4320` in
  `.yarnrc.yml`): new dependency versions are not installable for 3 days,
  which blocks the large majority of malicious releases (median takedown is
  ~14h). Bump a dep's range only after it has aged past the cooldown.
- **Test the pipeline** with a patch release on `mem-fs` first before relying on
  it for a major.
