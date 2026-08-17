import assert from 'node:assert';
import path from 'node:path';
import type fs from 'node:fs';
import { isFileStateModified, setModifiedFileState } from '../state.ts';
import File from 'vinyl';
import type { MemFsEditor, MemFsEditorFile } from '../index.ts';
import type { Store } from 'mem-fs';

type CompareFile = { contents: null | Buffer; stat?: { mode?: number } | null };

export const isMemFsEditorFileEqual = (a: CompareFile, b: CompareFile): boolean => {
  if (a.stat?.mode !== b.stat?.mode) {
    return false;
  }

  return (
    a.contents === b.contents ||
    (a.contents !== null && b.contents !== null && a.contents.equals(b.contents))
  );
};

export function writeInternal<EditorFile extends MemFsEditorFile>(
  store: Store<EditorFile>,
  file: EditorFile,
): void {
  if (store.existsInMemory(file.path)) {
    // Backward compatibility, keep behavior for existing files, custom properties may have been added
    const existingFile = store.get(file.path);
    if (
      !isFileStateModified(existingFile) ||
      !isMemFsEditorFileEqual(existingFile, file)
    ) {
      const { contents, stat } = file;
      setModifiedFileState(existingFile);
      Object.assign(existingFile, { contents, stat: stat ?? existingFile.stat });
      store.add(existingFile);
    }
  } else {
    setModifiedFileState(file);
    store.add(file);
  }
}

export default function write(
  this: MemFsEditor,
  filepath: string,
  contents: string | Buffer,
  stat?: fs.Stats,
): string {
  assert.ok(
    typeof contents === 'string' || Buffer.isBuffer(contents),
    'Expected `contents` to be a String or a Buffer',
  );

  const newContents = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);

  writeInternal(
    this.store,
    new File({
      path: path.resolve(filepath),
      contents: newContents,
      stat,
    }),
  );

  return contents.toString();
}
