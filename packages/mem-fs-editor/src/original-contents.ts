import fs from 'node:fs';
import type { MemFsEditorFile } from './index.ts';

function readFromDisk(filepath: string): Buffer | null {
  try {
    return fs.readFileSync(filepath);
  } catch {
    return null;
  }
}

/**
 * Capture the original contents of a file tracked in memory: its current
 * contents are the pre-modification original. Tracked on the file itself as
 * `originalContents`, until the file's state is reset (e.g. by `commit()`).
 *
 * Files whose store entry carries no contents (e.g. never read from the
 * disk) fall back to reading the disk once.
 */
export const captureOriginalContents = (file: MemFsEditorFile): void => {
  if (file.originalContents !== undefined) {
    return;
  }

  file.originalContents = file.contents ?? readFromDisk(file.path);
};

/**
 * Capture the original contents of a file not tracked in memory by reading
 * it from the disk. Callers must ensure the file holds no captured original
 * of its own (e.g. a vinyl clone carrying its source's `originalContents`).
 */
export const captureOriginalFromDisk = (file: MemFsEditorFile): void => {
  file.originalContents = readFromDisk(file.path);
};
