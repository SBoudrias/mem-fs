import assert from 'node:assert';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import createDebug from 'debug';

import { glob, type GlobOptions, isDynamicPattern } from 'tinyglobby';
import normalize from 'normalize-path';
import File from 'vinyl';

import multimatch, { type Options as MultimatchOptions } from 'multimatch';

import type { MemFsEditor } from '../index.ts';
import {
  resolveFromPaths,
  getCommonPath,
  globify,
  resolveGlobOptions,
  type ResolvedFrom,
} from '../util.ts';
import { writeInternal } from './write.ts';

const debug = createDebug('mem-fs-editor:copy-async');

async function getOneFile(filepath: string): Promise<string | undefined> {
  const resolved = path.resolve(filepath);
  try {
    const stats = await fsPromises.stat(resolved);
    return stats.isFile() ? resolved : undefined;
  } catch {
    return undefined;
  }
}

type CopySingleAsyncOptions<
  TransformData = unknown,
  TransformOptions = unknown,
> = Parameters<MemFsEditor['append']>[2] & {
  append?: boolean;

  /**
   * @experimental This API is experimental and may change without a major version bump.
   *
   * Transform both the file path and content during copy.
   * @param options The transform options
   * @param options.destinationPath The destination file path
   * @param options.sourcePath The source file path
   * @param options.contents The file content as Buffer
   * @param options.options The options passed to fileTransform
   * @param options.data The data passed to fileTransform
   * @returns An object containing the new file path and contents.
   */
  fileTransform?: (options: {
    destinationPath: string;
    sourcePath: string;
    contents: Buffer;
    data?: TransformData;
    options?: TransformOptions;
  }) =>
    | { path: string; contents: string | Buffer }
    | Promise<{ path: string; contents: string | Buffer }>;
  transformData?: TransformData;
  transformOptions?: TransformOptions;
};

type CopyAsyncOptions<
  TransformData = unknown,
  TransformOptions = unknown,
> = CopySingleAsyncOptions<TransformData, TransformOptions> & {
  noGlob?: boolean;
  /**
   * Options for disk globbing.
   * Glob options that should be compatible with minimatch results.
   */
  globOptions?: Pick<
    GlobOptions,
    | 'caseSensitiveMatch'
    | 'cwd'
    | 'debug'
    | 'deep'
    | 'dot'
    | 'expandDirectories'
    | 'followSymbolicLinks'
  >;
  /**
   * Options for store files matching.
   */
  storeMatchOptions?: MultimatchOptions;
  ignoreNoMatch?: boolean;
  fromBasePath?: string;
};

const defaultFileTransform: NonNullable<CopyAsyncOptions['fileTransform']> = ({
  destinationPath,
  contents,
}) => ({
  path: destinationPath,
  contents,
});

async function copySingleAsync<
  const TransformData = unknown,
  const TransformOptions = unknown,
>(
  editor: MemFsEditor,
  from: string,
  to: string,
  options: CopySingleAsyncOptions<TransformData, TransformOptions> = {},
): Promise<void> {
  const resolvedFrom = path.resolve(from);

  debug('Copying %s to %s with %o', resolvedFrom, to, options);

  const file = editor.store.get(resolvedFrom);
  assert.ok(file.contents, `Cannot copy empty file ${resolvedFrom}`);

  const {
    fileTransform = defaultFileTransform,
    transformOptions,
    transformData,
  } = options;
  const { path: destinationPath, contents } = await fileTransform({
    destinationPath: path.resolve(to),
    sourcePath: resolvedFrom,
    contents: file.contents,
    options: transformOptions,
    data: transformData,
  });

  if ((options.append ?? false) && editor.store.existsInMemory(destinationPath)) {
    editor.append(destinationPath, contents, { create: true, ...options });
  } else if (File.isVinyl(file)) {
    writeInternal(
      editor.store,
      Object.assign(file.clone({ contents: false, deep: false }), {
        contents: Buffer.from(contents),
        path: destinationPath,
      }),
    );
  } else {
    writeInternal(
      editor.store,
      new File({
        contents: Buffer.from(contents),
        stat: fs.statSync(file.path, { throwIfNoEntry: false }),
        path: destinationPath,
        history: [file.path],
      }),
    );
  }
}

export async function copyAsync<
  const TransformData = unknown,
  const TransformOptions = unknown,
>(
  this: MemFsEditor,
  from: string | string[],
  to: string,
  options: CopyAsyncOptions<TransformData, TransformOptions> = {},
): Promise<void> {
  const resolvedTo = path.resolve(to);
  const { noGlob = false } = options;
  const hasGlobOptions = Boolean(options.globOptions);
  const hasMultimatchOptions = Boolean(options.storeMatchOptions);
  assert.ok(
    !noGlob || !hasGlobOptions,
    '`noGlob` and `globOptions` are mutually exclusive',
  );
  assert.ok(
    !noGlob || !hasMultimatchOptions,
    '`noGlob` and `storeMatchOptions` are mutually exclusive',
  );

  if (typeof from === 'string') {
    const oneFile = await getOneFile(from);
    if (oneFile !== undefined) {
      return copySingleAsync(this, oneFile, resolvedTo, options);
    }
  }

  const { fromBasePath = getCommonPath(from) } = options;
  const resolvedFromPaths = resolveFromPaths({ from, fromBasePath });
  const hasDynamicPattern = resolvedFromPaths.some((f) =>
    isDynamicPattern(normalize(f.from)),
  );
  const { preferFiles } = resolveGlobOptions({
    noGlob,
    hasDynamicPattern,
  });

  const storeFiles: string[] = [];
  const globResolved: ResolvedFrom[] = [];

  for (const resolvedFromPath of resolvedFromPaths) {
    const { resolvedFrom } = resolvedFromPath;
    if (this.exists(resolvedFrom)) {
      storeFiles.push(resolvedFrom);
    } else {
      globResolved.push(resolvedFromPath);
    }
  }

  let diskFiles: string[] = [];
  if (globResolved.length > 0) {
    const patterns = globResolved.flatMap((file) => globify(file.from));
    const globMatches = await glob(patterns, {
      cwd: fromBasePath,
      ...options.globOptions,
      absolute: true,
      onlyFiles: true,
    });
    diskFiles = globMatches.map((file) => path.resolve(file));

    const normalizedStoreFilePaths = this.store
      .all()
      .filter((file) => this.exists(file.path))
      .map((file) => file.path)
      .filter((filePath) => !diskFiles.includes(filePath))
      .map((filePath) => normalize(filePath))
      // The store may have a glob path and when we try to copy it will fail because not real file
      .filter((filePath) => !isDynamicPattern(filePath));

    for (const filePath of multimatch(
      normalizedStoreFilePaths,
      patterns.map((p) =>
        path.isAbsolute(p) ? p : path.posix.join(normalize(fromBasePath), p),
      ),
      options.storeMatchOptions,
    )) {
      storeFiles.push(path.resolve(filePath));
    }
  }

  // Sanity checks: Makes sure we copy at least one file.
  assert.ok(
    (options.ignoreNoMatch ?? false) || diskFiles.length > 0 || storeFiles.length > 0,
    `Trying to copy from a source that does not exist: ${String(from)}`,
  );

  // If `from` is an array, or if it contains any dynamic patterns, or if it doesn't exist, `to` must be a directory.
  const treatToAsDir = Array.isArray(from) || !preferFiles || globResolved.length > 0;
  let generateDestination: (filepath: string) => string = () => resolvedTo;
  if (treatToAsDir) {
    assert.ok(
      !this.exists(resolvedTo) || fs.statSync(resolvedTo).isDirectory(),
      'When copying multiple files, provide a directory as destination',
    );

    generateDestination = (filepath) =>
      path.join(resolvedTo, path.relative(fromBasePath, filepath));
  }

  await Promise.all([
    ...diskFiles.map((file) =>
      copySingleAsync(this, file, generateDestination(file), options),
    ),
    ...storeFiles.map((file) =>
      copySingleAsync(this, file, generateDestination(file), options),
    ),
  ]);
}
