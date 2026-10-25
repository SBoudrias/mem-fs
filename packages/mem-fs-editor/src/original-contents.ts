import fs from 'node:fs';
import type { MemFsEditorFile } from './index.ts';

type OriginalContentsRecord = {
  /**
   * The original contents. Unused while `diskPath` is set and the contents
   * must be lazily read from the disk on first access.
   */
  contents: Buffer | null;
  diskPath?: string;
};

/**
 * Registry of the on-disk contents files had before their first modification
 * through the editor, keyed by the store's file object.
 *
 * The original is captured when a file is first made pending:
 * - files already tracked in memory keep their current contents as original;
 * - files never loaded in memory are read from the disk lazily, on first
 *   access.
 *
 * The record is dropped when the file's state is reset (e.g. by `commit()`),
 * so a new modification cycle captures a fresh original.
 */
const originalContents = new WeakMap<MemFsEditorFile, OriginalContentsRecord>();

function readFromDisk(filepath: string): Buffer | null {
  try {
    return fs.readFileSync(filepath);
  } catch {
    return null;
  }
}

/**
 * Capture the original contents of a file by reading it from the disk, on
 * first access.
 */
export const captureOriginalFromDisk = (file: MemFsEditorFile): void => {
  /* v8 ignore next 3 -- @preserve both callers already hold no record */
  if (originalContents.has(file)) {
    return;
  }

  originalContents.set(file, { contents: null, diskPath: file.path });
};

/**
 * Capture the original contents of a file tracked in memory: its current
 * contents are the pre-modification original.
 */
export const captureOriginalContents = (file: MemFsEditorFile): void => {
  if (originalContents.has(file)) {
    return;
  }

  if (file.contents == null) {
    captureOriginalFromDisk(file);
    return;
  }

  // Editor writes always assign a new buffer, so keeping a reference to the
  // current buffer is enough to preserve the pre-modification contents.
  originalContents.set(file, { contents: file.contents });
};

/**
 * Get the original (on-disk) contents of a pending file. Returns `null` when
 * the file doesn't exist on the disk.
 */
export const getOriginalContents = (file: MemFsEditorFile): Buffer | null => {
  const record = originalContents.get(file);
  if (record == null) {
    return null;
  }

  if (record.diskPath != null) {
    record.contents = readFromDisk(record.diskPath);
    delete record.diskPath;
  }

  return record.contents;
};

/**
 * Drop the captured original of a file, so the next modification captures a
 * fresh one.
 */
export const clearOriginalContents = (file: MemFsEditorFile): void => {
  originalContents.delete(file);
};
