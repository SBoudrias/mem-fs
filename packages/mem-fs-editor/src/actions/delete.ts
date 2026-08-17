import path from 'node:path';
import { globSync, type GlobOptions } from 'tinyglobby';
import multimatch from 'multimatch';
import normalize from 'normalize-path';

import type { MemFsEditor } from '../index.ts';
import { setDeletedFileState } from '../state.ts';
import { globify } from '../util.ts';

export default function deleteAction(
  this: MemFsEditor,
  paths: string | string[],
  options?: {
    globOptions?: Omit<GlobOptions, 'patterns' | 'absolute' | 'onlyFiles'>;
  },
): void {
  const pathsArray = Array.isArray(paths) ? paths : [paths];
  const resolvedPaths = globify(pathsArray.map((filePath) => path.resolve(filePath)));

  const globOptions = options?.globOptions ?? {};
  const files = new Set([
    ...globSync(resolvedPaths, {
      ...globOptions,
      absolute: true,
      onlyFiles: true,
    }).map((filePath) => path.resolve(filePath)),
    ...multimatch(
      this.store
        .all()
        .map((file) => file.path)
        .map((filePath) => normalize(filePath)),
      resolvedPaths,
    ).map((filePath) => path.resolve(filePath)),
  ]);
  for (const file of files) {
    const storeFile = this.store.get(file);
    setDeletedFileState(storeFile);
    storeFile.contents = null;
    this.store.add(storeFile);
  }
}
