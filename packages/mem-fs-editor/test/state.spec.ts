import { describe, beforeEach, it, expect } from 'vitest';
import { type MemFsEditorFile } from '../src/index.ts';
import { getFixture } from './fixtures.ts';
import {
  clearFileState,
  hasClearedState,
  isFileCommitted,
  isFileNew,
  isFilePending,
  isFileStateDeleted,
  isFileStateModified,
  resetFile,
  resetFileCommitStates,
  resetFileState,
  setCommittedFile,
  setDeletedFileState,
  setModifiedFileState,
} from '../src/state.ts';

describe('state', () => {
  let file: MemFsEditorFile;
  beforeEach(() => {
    file = { path: '', contents: null };
  });

  it('setModifiedFileState()/isFileStateModified()', () => {
    expect(file.state).toBeUndefined();
    expect(isFileStateModified(file)).toBe(false);

    setModifiedFileState(file);

    expect(file.state).toBe('modified');
    expect(isFileStateModified(file)).toBe(true);
  });

  it('setDeletedFileState()/isFileStateDeleted()', () => {
    expect(file.state).toBeUndefined();
    expect(isFileStateDeleted(file)).toBe(false);

    setDeletedFileState(file);

    expect(file.state).toBe('deleted');
    expect(isFileStateDeleted(file)).toBe(true);
  });

  it('setCommittedFile()/fileStateIsCommitted()', () => {
    expect(file.committed).toBeUndefined();
    expect(isFileCommitted(file)).toBe(false);

    setCommittedFile(file);

    expect(file.committed).toBe(true);
    expect(isFileCommitted(file)).toBe(true);
  });

  it('resetFileState()', () => {
    file.state = 'modified';
    file.isNew = true;

    resetFileState(file);

    expect(file.state).toBeUndefined();
    expect(file.isNew).toBe(true);
  });

  it('resetFileCommitStates()', () => {
    file.state = 'modified';
    file.isNew = true;
    file.stateCleared = 'deleted';
    file.committed = true;

    resetFileCommitStates(file);

    expect(file.state).toBe('modified');
    expect(file.isNew).toBe(true);
    expect(file.stateCleared).toBeUndefined();
    expect(file.committed).toBeUndefined();
  });

  it('resetFile()', () => {
    file.state = 'modified';
    file.isNew = true;
    file.stateCleared = 'deleted';
    file.committed = true;

    resetFile(file);

    expect(file.state).toBeUndefined();
    expect(file.isNew).toBeUndefined();
    expect(file.stateCleared).toBeUndefined();
    expect(file.committed).toBeUndefined();
  });

  it('clearFileState()', () => {
    file.state = 'modified';
    file.isNew = true;

    clearFileState(file);

    expect(file.state).toBeUndefined();
    expect(file.stateCleared).toBe('modified');
    expect(file.isNew).toBeUndefined();
    expect(hasClearedState(file)).toBe(true);
  });

  describe('isFileNew()', () => {
    it('with new file', () => {
      expect(file.isNew).toBeUndefined();
      file.path = 'foo';

      expect(isFileNew(file)).toBe(true);
      expect(file.isNew).toBe(true);
    });

    it('with existing file', () => {
      expect(file.isNew).toBeUndefined();
      file.path = getFixture('file-a.txt');

      expect(isFileNew(file)).toBe(false);
      expect(file.isNew).toBe(false);
    });
  });

  describe('isFilePending()', () => {
    it('unkown state', () => {
      expect(isFilePending(file)).toBe(false);
    });

    it('modified state', () => {
      setModifiedFileState(file);
      expect(isFilePending(file)).toBe(true);
    });

    it('delete state and new file', () => {
      file.path = 'foo';
      setDeletedFileState(file);
      expect(isFilePending(file)).toBe(false);
    });

    it('delete state and existing file', () => {
      file.path = getFixture('file-a.txt');
      setDeletedFileState(file);
      expect(isFilePending(file)).toBe(true);
    });
  });
});
