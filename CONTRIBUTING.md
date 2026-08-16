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

Releases are tag-driven and staged. CI stages the package; a maintainer approves it with 2FA before it goes live.

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

Pushing the tag triggers `.github/workflows/publish.yaml`:

1. **test** — `yarn install --immutable` + `yarn vitest run`
2. **build** — `yarn tsc`, uploads each `dist/` as an artifact
3. **publish** — downloads the matching `dist/` artifact, runs `npm stage publish --ignore-scripts` for the tagged package

The package is now **staged**, not live.

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

Then configure the Trusted Publisher on npmjs.com. Later releases use the tag → stage → approve flow.

## Published packages

Only `mem-fs` and `mem-fs-editor` are published. `@repo/tsconfig` and the root package are `private: true`.
