import fs from 'fs/promises';
import path from 'path';
import {
  clearFileState,
  isFileStateModified,
  isFileStateDeleted,
  setCommittedFile,
  isFileNew,
} from '../state.ts';
import type { MemFsEditorFile } from '../index.ts';

function hasErrorCode(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error;
}

async function write(file: MemFsEditorFile) {
  if (!file.contents) {
    throw new Error(`${file.path} cannot write an empty file`);
  }

  const dir = path.dirname(file.path);
  try {
    if (!(await fs.stat(dir)).isDirectory()) {
      throw new Error(`${dir} is not a directory`);
    }
  } catch (error) {
    if (hasErrorCode(error) && error.code === 'ENOENT') {
      await fs.mkdir(dir, { recursive: true });
    } else {
      throw error;
    }
  }

  const newMode = file.stat?.mode;
  await fs.writeFile(file.path, file.contents, { mode: newMode });

  if (newMode !== undefined) {
    const { mode: existingMode } = await fs.stat(file.path);
    // eslint-disable-next-line no-bitwise
    if ((existingMode & 0o777) !== (newMode & 0o777)) {
      await fs.chmod(file.path, newMode);
    }
  }
}

export default async function commitFileAsync(file: MemFsEditorFile) {
  if (isFileStateModified(file)) {
    setCommittedFile(file);
    await write(file);
  } else if (isFileStateDeleted(file) && !isFileNew(file)) {
    setCommittedFile(file);
    await fs.rm(file.path, { recursive: true });
  }

  clearFileState(file);
}
