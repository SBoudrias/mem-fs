# Contributing to mem-fs

## Development setup

```sh
yarn install
```

## Commands

| Command           | What it does                                         |
| ----------------- | ---------------------------------------------------- |
| `yarn test`       | Runs vitest with coverage                            |
| `yarn vitest run` | Runs vitest without coverage (faster)                |
| `yarn pretest`    | `package lint --check`, eslint, oxfmt, tsc typecheck |
| `yarn tsc`        | Builds every package to `dist/` (turbo)              |
| `yarn eslint .`   | Lint                                                 |
| `yarn oxfmt`      | Format                                               |

## Releasing

Releases are staged. CI stages the packages; a maintainer approves them with 2FA before they go live.

### Cut a release

```sh
git checkout main
git pull

yarn lerna version           # interactive: pick the bump per package
# → updates each package.json + CHANGELOG
# → commits "chore(release): publish"
# → creates tags like mem-fs@4.1.6 and/or mem-fs-editor@12.0.7

git push origin main --follow-tags
```

Pushing to `main` triggers `.github/workflows/publish.yml`. A `guard` job checks whether any release tags point at the pushed commit and skips the rest of the workflow when there are none (so regular commits don't re-run CI):

1. **test** — `yarn install --immutable` + `yarn vitest run`
2. **build** — `yarn tsc`
3. **publish** — `yarn lerna publish from-git --stage --yes --no-git-reset`

`lerna publish from-git` publishes every package tagged at HEAD (all tags created by `lerna version` point at the same commit). lerna-lite applies the `publishConfig` manifest overrides (main/types/exports) natively, runs the `prepublishOnly` build, and stages each package via npm's staged publishing. The packages are now **staged**, not live.

### Approve the release

```sh
npm stage list
npm stage view <stage-id>
npm stage approve <stage-id>   # 2FA → package goes live with provenance
```

### First publish of a new package

Trusted Publishing can't be configured until the package exists on npm. Publish once manually:

```sh
cd packages/<name>
npm publish --ignore-scripts --access public   # interactive 2FA
```

Then configure the Trusted Publisher on npmjs.com. Later releases use the push → stage → approve flow.

## Published packages

Only `mem-fs` and `mem-fs-editor` are published. `@repo/tsconfig` and the root package are `private: true`.
