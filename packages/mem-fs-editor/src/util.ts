import fs from 'node:fs';
import path from 'node:path';
import commondir from 'commondir';
import { isDynamicPattern } from 'tinyglobby';
import normalize from 'normalize-path';
import { isBinaryFileSync } from 'isbinaryfile';
import textextensions from 'textextensions';
import binaryextensions from 'binaryextensions';

function notNullOrExclusion(file?: string): boolean {
  return file !== undefined && !file.startsWith('!');
}

export function getCommonPath(filePath: string | string[]): string {
  if (Array.isArray(filePath)) {
    const paths = filePath
      .filter((file) => notNullOrExclusion(file))
      .map((file) => getCommonPath(file));

    return commondir(paths);
  }

  const globStartIndex = filePath.indexOf('*');
  if (globStartIndex !== -1) {
    return path.dirname(filePath.slice(0, globStartIndex + 1));
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    return filePath;
  }

  return path.dirname(filePath);
}

export function globify(inputFilePath: string): string | string[];
export function globify(inputFilePath: string[]): string[];
export function globify(inputFilePath: string | string[]): string | string[] {
  if (Array.isArray(inputFilePath)) {
    const globbed: string[] = [];
    for (const pattern of inputFilePath) {
      const result = globify(pattern);
      if (Array.isArray(result)) {
        globbed.push(...result);
      } else {
        globbed.push(result);
      }
    }

    return globbed;
  }

  const filePath = normalize(inputFilePath);

  if (isDynamicPattern(filePath)) {
    return filePath;
  }

  if (!fs.existsSync(filePath)) {
    // The target of a pattern who's not a glob and doesn't match an existing
    // Entity on the disk is ambiguous. As such, match both files and directories.
    return [filePath, normalize(path.join(filePath, '**'))];
  }

  const fsStats = fs.statSync(filePath);
  if (fsStats.isFile()) {
    return filePath;
  }

  if (fsStats.isDirectory()) {
    return normalize(path.join(filePath, '**'));
  }

  throw new Error('Only file path or directory path are supported.');
}

export function isBinary(filePath: string, newFileContents?: Buffer): boolean {
  const extension = path.extname(filePath).replace(/^\./v, '') || path.basename(filePath);
  if (binaryextensions.includes(extension)) {
    return true;
  }

  if (textextensions.includes(extension)) {
    return false;
  }

  return (
    (fs.existsSync(filePath) && isBinaryFileSync(filePath)) ||
    (newFileContents !== undefined && isBinaryFileSync(newFileContents))
  );
}

export type ResolvedFrom = {
  from: string;
  resolvedFrom: string;
  relativeFrom: string;
};

export function resolveFromPaths({
  from,
  fromBasePath,
}: {
  from: string | string[];
  fromBasePath: string;
}): ResolvedFrom[] {
  return (Array.isArray(from) ? from : [from]).map((filePath) => {
    const filePathIsAbsolute = path.isAbsolute(filePath);
    const relativeFrom = filePathIsAbsolute
      ? path.relative(fromBasePath, filePath)
      : filePath;
    const resolvedFrom = filePathIsAbsolute
      ? filePath
      : path.resolve(fromBasePath, filePath);
    return { from: filePath, resolvedFrom, relativeFrom };
  });
}

export function resolveGlobOptions({
  noGlob,
  hasDynamicPattern,
}: {
  noGlob?: boolean;
  hasDynamicPattern?: boolean;
}): { preferFiles: boolean } {
  return { preferFiles: (noGlob ?? false) || !(hasDynamicPattern ?? false) };
}
