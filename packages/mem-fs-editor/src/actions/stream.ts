import type { MemFsEditor, MemFsEditorFile } from '../index.ts';
import { clearOriginalContents, getOriginalContents } from '../original-contents.ts';
import {
  clearFileState,
  isFileNew,
  isFilePending,
  isFileStateDeleted,
  setCommittedFile,
} from '../state.ts';
import { isMemFsEditorFileEqual } from './write.ts';

export type StreamedFile = {
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
   * the disk.
   */
  originalContents: Buffer | null;

  /**
   * `'added'` when the file doesn't exist on the disk, `'modified'` when it
   * does, `'deleted'` when the pending change removes it.
   */
  state: 'added' | 'modified' | 'deleted';

  /**
   * `true` when persisting the pending change would alter the disk:
   * - `added`: the file doesn't exist on the disk;
   * - `modified`: the pending contents differ from the on-disk contents;
   * - `deleted`: the file exists on the disk.
   */
  changed: boolean;

  /**
   * The store's file object, for consumers needing to update the editor
   * state after persisting (e.g. with `markCommitted()`).
   */
  file: MemFsEditorFile;
};

export type StreamOptions<EditorFile extends MemFsEditorFile> = {
  /**
   * Restrict the stream to matching files. Defaults to pending files, i.e.
   * files with a change staged by the editor.
   */
  filter?: (file: EditorFile) => boolean;
};

/**
 * Stream each pending change staged in the editor, letting the consumer
 * decide what to persist and how - a streaming alternative to `commit()`.
 *
 * `stream()` never writes to the disk (originals may be read from it) and
 * does not reset the pending state of the files it yields.
 */
async function* stream<EditorFile extends MemFsEditorFile>(
  this: MemFsEditor<EditorFile>,
  options: StreamOptions<EditorFile> = {},
): AsyncGenerator<StreamedFile, void, undefined> {
  const { filter = isFilePending } = options;

  // mem-fs' Store#stream() returns a plain object-mode Readable; typing the
  // iterable keeps the yielded files typed.
  const files: AsyncIterable<EditorFile> = this.store.stream({ filter });
  for await (const file of files) {
    const originalContents = getOriginalContents(file);

    if (file.contents === null) {
      // Pending changes always carry contents; without contents (e.g. a
      // directory picked up in the store), there is nothing to persist.
      if (isFileStateDeleted(file)) {
        yield {
          path: file.path,
          contents: null,
          originalContents,
          state: 'deleted',
          changed: originalContents != null,
          file,
        };
      }
    } else {
      const { contents } = file;
      const changed =
        originalContents == null ||
        !isMemFsEditorFileEqual({ contents }, { contents: originalContents });

      yield {
        path: file.path,
        contents,
        originalContents,
        state: isFileNew(file) ? 'added' : 'modified',
        changed,
        file,
      };
    }
  }
}

/**
 * Mark a streamed file as handled: the same bookkeeping `commit()` performs
 * after persisting a file, without touching the disk. Call it once you
 * persisted (or deliberately skipped) a file streamed through `stream()`.
 */
export function markCommitted(file: MemFsEditorFile): void {
  setCommittedFile(file);
  clearOriginalContents(file);
  clearFileState(file);
}

export default stream;
