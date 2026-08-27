import { describe, beforeEach, it, expect, vi, type MockInstance } from 'vitest';
import fs from 'node:fs';
import { type MemFsEditor, type MemFsEditorFile, create } from '../src/index.ts';
import { create as createMemFs, type Store } from 'mem-fs';
import { getFixture } from './fixtures.ts';

describe('#write()', () => {
  let memFs: MemFsEditor;
  let addSpy: MockInstance<Store<MemFsEditorFile>['add']>;

  beforeEach(() => {
    const store = createMemFs<MemFsEditorFile>();
    addSpy = vi.spyOn(store, 'add');

    memFs = create(store);
  });

  it('write string to a new file', () => {
    const filepath = getFixture('does-not-exist.txt');
    const contents = 'some text';
    memFs.write(filepath, contents);
    expect(memFs.read(filepath)).toBe(contents);
    expect(memFs.store.get(filepath).state).toBe('modified');
  });

  it('write buffer to a new file', () => {
    const filepath = getFixture('does-not-exist.txt');
    const contents = Buffer.from('omg!', 'base64');
    memFs.write(filepath, contents);
    expect(memFs.read(filepath)).toBe(contents.toString());
    expect(memFs.store.get(filepath).state).toBe('modified');
  });

  it('write an existing file', () => {
    const filepath = getFixture('file-a.txt');
    const contents = 'some text';
    memFs.write(filepath, contents);
    expect(memFs.read(filepath)).toBe(contents);
    expect(memFs.store.get(filepath).state).toBe('modified');
  });

  it("doesn't re-add an identical file that already exist in memory", () => {
    const filepath = getFixture('file-a.txt');
    const contents = 'some text';
    memFs.write(filepath, contents);
    expect(addSpy).toHaveBeenCalledOnce();
    expect(memFs.read(filepath)).toBe(contents);
    expect(memFs.store.get(filepath).state).toBe('modified');

    memFs.write(filepath, contents);
    expect(addSpy).toHaveBeenCalledOnce();
  });

  it('write attaches metadata to the file', () => {
    const filepath = getFixture('does-not-exist.txt');
    const metadata = { cleanupMarks: true };
    memFs.write(filepath, 'some text', { metadata });
    expect(memFs.store.get(filepath).editorMetadata).toEqual(metadata);
    expect(memFs.store.get(filepath).state).toBe('modified');
  });

  it('write without metadata has undefined editorMetadata', () => {
    const filepath = getFixture('does-not-exist.txt');
    memFs.write(filepath, 'some text');
    expect(memFs.store.get(filepath).editorMetadata).toBeUndefined();
  });

  it('write metadata on existing file overwrites metadata', () => {
    const filepath = getFixture('file-a.txt');
    memFs.write(filepath, 'first', { metadata: { foo: 1 } });
    expect(memFs.store.get(filepath).editorMetadata).toEqual({ foo: 1 });
    memFs.write(filepath, 'second', { metadata: { bar: 2 } });
    expect(memFs.store.get(filepath).editorMetadata).toEqual({ bar: 2 });
  });

  it('write without metadata preserves existing file metadata', () => {
    const filepath = getFixture('file-a.txt');
    memFs.write(filepath, 'first', { metadata: { foo: 1 } });
    memFs.write(filepath, 'second');
    expect(memFs.store.get(filepath).editorMetadata).toEqual({ foo: 1 });
  });

  it('backward compat: write with fs.Stats as 3rd arg still works', () => {
    const filepath = getFixture('does-not-exist.txt');
    const stat = fs.statSync(getFixture('file-a.txt'));
    // Deliberately exercises the deprecated bare fs.Stats overload.
    // oxlint-disable-next-line typescript/no-deprecated
    memFs.write(filepath, 'some text', stat);
    expect(memFs.read(filepath)).toBe('some text');
    expect(memFs.store.get(filepath).stat).toBe(stat);
    expect(memFs.store.get(filepath).editorMetadata).toBeUndefined();
  });
});
