import assert from 'assert';
import fs from 'fs';
import path from 'path';
import createDebug from 'debug';
import { globSync, isDynamicPattern, type GlobOptions } from 'tinyglobby';
import multimatch from 'multimatch';
import type { Options as MultimatchOptions } from 'multimatch';
import normalize from 'normalize-path';
import File from 'vinyl';
import { writeInternal } from './write.ts';

import type { MemFsEditor } from '../index.ts';
import {
  resolveFromPaths,
  getCommonPath,
  ResolvedFrom,
  resolveGlobOptions,
  globify,
} from '../util.ts';

const debug = createDebug('mem-fs-editor:copy');

type CopySingleOptions<TransformData = unknown, TransformOptions = unknown> = {
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
  }) => { path: string; contents: string | Buffer };
  transformData?: TransformData;
  transformOptions?: TransformOptions;
};

type CopyOptions<TransformData = unknown, TransformOptions = unknown> = CopySingleOptions<
  TransformData,
  TransformOptions
> & {
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

export function copy<const TransformData = unknown, const TransformOptions = unknown>(
  this: MemFsEditor,
  from: string | string[],
  to: string,
  options: CopyOptions<TransformData, TransformOptions> = {},
) {
  const { fromBasePath = getCommonPath(from), noGlob } = options;
  const hasGlobOptions = Boolean(options.globOptions);
  const hasMultimatchOptions = Boolean(options.storeMatchOptions);
  assert(!noGlob || !hasGlobOptions, '`noGlob` and `globOptions` are mutually exclusive');
  assert(
    !noGlob || !hasMultimatchOptions,
    '`noGlob` and `storeMatchOptions` are mutually exclusive',
  );

  const resolvedFromPaths = resolveFromPaths({ from, fromBasePath });
  const hasDynamicPattern = resolvedFromPaths.some((f) =>
    isDynamicPattern(normalize(f.from)),
  );
  const { preferFiles } = resolveGlobOptions({
    noGlob,
    hasDynamicPattern,
    hasGlobOptions,
  });

  const foundFiles: ResolvedFrom[] = [];
  const globResolved: ResolvedFrom[] = [];

  for (const resolvedFromPath of resolvedFromPaths) {
    const { from: filePath, resolvedFrom } = resolvedFromPath;
    if (preferFiles && this.exists(resolvedFrom)) {
      foundFiles.push(resolvedFromPath);
    } else if (noGlob) {
      throw new Error('Trying to copy from a source that does not exist: ' + filePath);
    } else {
      globResolved.push(resolvedFromPath);
    }
  }

  if (globResolved.length > 0) {
    const patterns = globResolved.map((file) => globify(file.from)).flat();
    const globbedFiles = globSync(patterns, {
      cwd: fromBasePath,
      ...options.globOptions,
      absolute: true,
      onlyFiles: true,
    }).map((filePath) => path.resolve(filePath));

    const normalizedStoreFilePaths = this.store
      .all()
      .filter((file) => this.exists(file.path))
      .map((file) => file.path)
      .filter((filePath) => !globbedFiles.includes(filePath))
      .map((filePath) => normalize(filePath))
      // The store may have a glob path and when we try to copy it will fail because not real file
      .filter((filePath) => !isDynamicPattern(filePath));

    multimatch(
      normalizedStoreFilePaths,
      patterns.map((p) =>
        path.isAbsolute(p) ? p : path.posix.join(normalize(fromBasePath), p),
      ),
      options.storeMatchOptions,
    ).forEach((filePath) => {
      globbedFiles.push(path.resolve(filePath));
    });

    const foundResolvedFrom = foundFiles.map((file) => file.resolvedFrom);
    foundFiles.push(
      ...resolveFromPaths({
        from: globbedFiles
          .map((filePath) => normalize(filePath))
          .filter((filePath) => !foundResolvedFrom.includes(filePath)),
        fromBasePath,
      }),
    );
  }

  // Sanity checks: Makes sure we copy at least one file.
  assert(
    options.ignoreNoMatch || foundFiles.length > 0,
    'Trying to copy from a source that does not exist: ' + from.toString(),
  );

  // If `from` is an array, or if it contains any dynamic patterns, or if it doesn't exist, `to` must be a directory.
  const treatToAsDir = Array.isArray(from) || !preferFiles || globResolved.length > 0;
  if (treatToAsDir) {
    assert(
      !this.exists(to) || fs.statSync(to).isDirectory(),
      'When copying multiple files, provide a directory as destination',
    );
  }

  foundFiles.forEach((file) => {
    const toFile = treatToAsDir ? path.join(to, file.relativeFrom) : to;

    copySingle(this, file.resolvedFrom, toFile, options);
  });
}

const defaultFileTransform: NonNullable<CopySingleOptions['fileTransform']> = ({
  destinationPath,
  contents,
}) => ({
  path: destinationPath,
  contents,
});

export function copySingle<
  const TransformData = unknown,
  const TransformOptions = unknown,
>(
  editor: MemFsEditor,
  from: string,
  to: string,
  options: CopySingleOptions<TransformData, TransformOptions> = {},
) {
  assert(
    editor.exists(from),
    'Trying to copy from a source that does not exist: ' + from,
  );

  debug('Copying %s to %s with %o', from, to, options);
  const file = editor.store.get(from);

  let contents: string | Buffer;
  /* v8 ignore next -- @preserve should not happen */
  if (!file.contents) {
    throw new Error(`Cannot copy empty file ${from}`);
  }

  const {
    fileTransform = defaultFileTransform,
    transformOptions,
    transformData,
  } = options;
  ({ path: to, contents } = fileTransform({
    destinationPath: path.resolve(to),
    sourcePath: from,
    contents: file.contents,
    options: transformOptions,
    data: transformData,
  }));

  if (options.append && editor.store.existsInMemory(to)) {
    editor.append(to, contents, { create: true, ...options });
  } else if (File.isVinyl(file)) {
    writeInternal(
      editor.store,
      Object.assign(file.clone({ contents: false, deep: false }), {
        contents: Buffer.from(contents),
        path: to,
      }),
    );
  } else {
    writeInternal(
      editor.store,
      new File({
        contents: Buffer.from(contents),
        stat: fs.statSync(file.path, { throwIfNoEntry: false }),
        path: to,
        history: [file.path],
      }),
    );
  }
}
