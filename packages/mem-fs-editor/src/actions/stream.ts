import type { MemFsEditor, MemFsEditorFile } from '../index.ts';
import { resolveOriginalContents } from '../original-contents.ts';
import {
  clearFileState,
  isFilePending,
  isFileStateDeleted,
  setCommittedFile,
} from '../state.ts';
import { isMemFsEditorFileEqual } from './write.ts';

/**
 * Whether persisting the pending stat would chmod the file, mirroring what
 * `commit()` does: a write staged without a stat never chmods, one with a
 * stat chmods when the mode differs from the on-disk mode.
 */
function isModeChanged(
  stat: { mode?: number } | null | undefined,
  originalStat: { mode?: number } | null,
): boolean {
  const mode = stat?.mode;
  if (mode == null) {
    return false;
  }

  const originalMode = originalStat?.mode;
  // A pending write staging a mode over an original stat without one: real
  // stats always carry a mode, only hand-built stat objects can lack it.
  /* v8 ignore next -- @preserve defensive, unreachable through the editor API */
  return originalMode == null || (mode & 0o777) !== (originalMode & 0o777);
}

/**
 * A pending change staged in the editor, as yielded by `stream()`.
 *
 * @experimental This API is experimental and may change without a major
 * version bump, like `copy()`'s `fileTransform`.
 */
export type StreamedFile<EditorFile extends MemFsEditorFile = MemFsEditorFile> = {
  /**
   * The absolute path of the file.
   */
  path: string;

  /**
   * The pending contents staged in the editor, `null` for deletions.
   */
  contents: Buffer | null;

  /**
   * The original (on-disk) contents the file had before its first
   * modification through the editor, `null` when the file doesn't exist on
   * the disk (a directory yields `null` too, with a real `originalStat`).
   */
  originalContents: Buffer | null;

  /**
   * The pending stat of the file (carrying e.g. `mode`), `undefined` when
   * the write staged no stat.
   */
  stat: EditorFile['stat'];

  /**
   * The stat the file had before its first modification through the editor,
   * `null` for new files.
   */
  originalStat: { mode?: number } | null;

  /**
   * `'added'` when the file doesn't exist on the disk, `'modified'` when it
   * does, `'deleted'` when the pending change removes it.
   */
  state: 'added' | 'modified' | 'deleted';

  /**
   * `true` when persisting the pending change would alter the disk:
   * - `added`: the file doesn't exist on the disk;
   * - `modified`: the pending contents differ from the on-disk ones, or
   *   the staged stat's mode would chmod the file;
   * - `deleted`: the file exists on the disk.
   */
  changed: boolean;

  /**
   * The store's file object, carrying the pending state and the captured
   * `originalContents`/`originalStat`.
   */
  file: EditorFile;

  /**
   * Mark this change as handled: the same bookkeeping `commit()` performs
   * after persisting a file, without touching the disk. Call it once you
   * persisted (or deliberately skipped) the change.
   */
  markCommitted: () => void;
};

export type StreamOptions<EditorFile extends MemFsEditorFile> = {
  /**
   * Restrict the stream to matching pending files. The filter narrows the
   * pending set; it never widens it to files without a staged change.
   */
  filter?: (file: EditorFile) => boolean;
};

/**
 * Stream each pending change staged in the editor, letting the consumer
 * decide what to persist and how - a streaming alternative to `commit()`.
 *
 * `stream()` never writes to the disk and does not reset the pending state
 * of the files it yields.
 *
 * Iterates a snapshot of the pending files, taken when the generator is
 * created: files written while iterating are not yielded.
 */
// An async generator is the API shape (for await ... of editor.stream()),
// even though the snapshot iteration itself needs no await.
// oxlint-disable-next-line typescript/require-await
async function* stream<EditorFile extends MemFsEditorFile>(
  this: MemFsEditor<EditorFile>,
  options: StreamOptions<EditorFile> = {},
): AsyncGenerator<StreamedFile<EditorFile>, void, undefined> {
  const { filter } = options;

  // Snapshot the pending files up front: writes staged while iterating are
  // not yielded, and the filter only narrows the pending set (unlike
  // Store#stream(), which reads the live store).
  const files = this.store
    .all()
    .filter((file) => isFilePending(file) && (filter?.(file) ?? true));

  for (const file of files) {
    const markCommitted = (): void => {
      setCommittedFile(file);
      clearFileState(file);
    };

    // Files written without being loaded in the store first resolve their
    // original from the disk once, here.
    const { contents: originalContents, stat: originalStat } =
      resolveOriginalContents(file);

    if (isFileStateDeleted(file)) {
      // Deletions staged their contents away; pending writes always carry
      // some.
      yield {
        path: file.path,
        contents: null,
        originalContents,
        stat: file.stat,
        originalStat,
        state: 'deleted',
        changed: originalContents != null,
        file,
        markCommitted,
      };
    } else {
      if (originalContents == null && originalStat != null) {
        // The path on the disk holds a directory: persisting through any
        // channel would fail, the same way `commit()` does.
        throw new Error(`${file.path} is not a file`);
      }

      const { contents, stat } = file;
      const changed =
        originalContents == null ||
        !isMemFsEditorFileEqual({ contents }, { contents: originalContents }) ||
        isModeChanged(stat, originalStat);

      yield {
        path: file.path,
        contents,
        originalContents,
        stat,
        originalStat,
        // The original contents were captured when the file was made
        // pending: they tell whether the file existed on the disk then.
        state: originalContents == null ? 'added' : 'modified',
        changed,
        file,
        markCommitted,
      };
    }
  }
}

export default stream;
