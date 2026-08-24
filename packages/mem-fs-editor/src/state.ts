import fs from 'node:fs';
import { type MemFsEditorFile } from './index.ts';

const states: Record<'MODIFIED' | 'DELETED', MemFsEditorFile['state']> = {
  MODIFIED: 'modified',
  DELETED: 'deleted',
};

export const setFileState = (
  file: MemFsEditorFile,
  state: MemFsEditorFile['state'],
): void => {
  file.state = state;
};

export const isFileNew = (file: MemFsEditorFile): boolean => {
  file.isNew ??= !fs.existsSync(file.path);
  return file.isNew;
};

export const isFileStateModified = (file: MemFsEditorFile): boolean =>
  file.state === states.MODIFIED;

export const setModifiedFileState = (file: MemFsEditorFile): void => {
  setFileState(file, states.MODIFIED);
};

export const isFileStateDeleted = (file: MemFsEditorFile): boolean =>
  file.state === states.DELETED;

export const setDeletedFileState = (file: MemFsEditorFile): void => {
  setFileState(file, states.DELETED);
};

export const isFilePending = (file: MemFsEditorFile): boolean =>
  isFileStateModified(file) || (isFileStateDeleted(file) && !isFileNew(file));

export const setCommittedFile = (file: MemFsEditorFile): void => {
  file.committed = true;
};

export const isFileCommitted = (file: MemFsEditorFile): boolean =>
  Boolean(file.committed);

export const resetFileState = (file: MemFsEditorFile): void => {
  delete file.state;
};

/**
 * Delete commit related states.
 */
export const resetFileCommitStates = (file: MemFsEditorFile): void => {
  delete file.stateCleared;
  delete file.committed;
};

/**
 * Delete all mem-fs-editor`s related states.
 */
export const resetFile = (file: MemFsEditorFile): void => {
  resetFileState(file);
  resetFileCommitStates(file);
  delete file.isNew;
};

export const clearFileState = (file: MemFsEditorFile): void => {
  if (file.state != null) {
    file.stateCleared = file.state;
  }

  resetFileState(file);
  delete file.isNew;
};

export const hasState = (file: MemFsEditorFile): boolean => Boolean(file.state);

export const hasClearedState = (file: MemFsEditorFile): boolean =>
  Boolean(file.stateCleared);
