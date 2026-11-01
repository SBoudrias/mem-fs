import fs from 'node:fs';
import type { MemFsEditorFile } from './index.ts';

type FileStat = { mode?: number } | null;

type Original = {
  contents: Buffer | null;
  stat: FileStat;
};

function isMissingPathError(error: unknown): boolean {
  // statSync(throwIfNoEntry: false) never reports ENOENT; ENOTDIR (a path
  // component in the way) is the only missing-path error it throws.
  return (
    typeof error === 'object' &&
    error != null &&
    'code' in error &&
    error.code === 'ENOTDIR'
  );
}

/**
 * Load the original (on-disk) contents and stat of a file. A path that
 * doesn't resolve to a file yields `null`s; anything else (permissions, a
 * directory at the path, ...) propagates, as persisting through any channel
 * would fail the same way `commit()` does.
 */
function loadOriginalFromDisk(filepath: string): Original {
  let stat: fs.Stats | null | undefined;
  try {
    stat = fs.statSync(filepath, { throwIfNoEntry: false });
  } catch (error) {
    if (isMissingPathError(error)) {
      return { contents: null, stat: null };
    }

    throw error;
  }

  if (stat == null) {
    return { contents: null, stat: null };
  }

  // Directories resolve to null contents but keep their stat: deleting a
  // directory is a legitimate pending change (`commit()` does a recursive
  // rm), while writing over one fails on persist, like `commit()` does.
  if (!stat.isFile()) {
    return { contents: null, stat };
  }

  return { contents: fs.readFileSync(filepath), stat };
}

/**
 * Capture the original contents and stat of a file tracked in memory: its
 * current contents and stat are the pre-modification originals. Tracked on
 * the file itself (`originalContents`/`originalStat`) until the file's state
 * is reset (e.g. by `commit()`).
 *
 * The first capture wins: subsequent modifications of an already pending
 * file keep the original of its first modification.
 *
 * Callers must ensure the file holds no pending state: pending files either
 * carry their captured original already, or resolve it from the disk lazily.
 */
export const captureOriginalContents = (file: MemFsEditorFile): void => {
  file.originalContents = file.contents;
  file.originalStat = file.stat ?? null;
};

/**
 * Resolve the original contents and stat of a pending file never captured
 * from memory (written without being loaded in the store first): read from
 * the disk once, memoized on the file.
 */
export const resolveOriginalContents = (file: MemFsEditorFile): Original => {
  if (file.originalContents === undefined) {
    const original = loadOriginalFromDisk(file.path);
    file.originalContents = original.contents;
    file.originalStat = original.stat;
  }

  return { contents: file.originalContents, stat: file.originalStat ?? null };
};
