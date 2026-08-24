import { describe, beforeEach, it, expect, vi } from 'vitest';
import { type MemFsEditor, type MemFsEditorFile, create } from '../src/index.ts';
import { create as createMemFs } from 'mem-fs';
import escape from 'escape-regexp';
import { getFixture } from './fixtures.ts';

describe('#readJSON()', () => {
  let memFs: MemFsEditor;

  beforeEach(() => {
    memFs = create(createMemFs<MemFsEditorFile>());
  });

  it('read the content of a file', () => {
    expect(memFs.readJSON(getFixture('file.json'))).toEqual({ foo: 'bar' });
  });

  it('calls read() with path', () => {
    vi.spyOn(memFs, 'read');

    const file = getFixture('file.json');
    memFs.readJSON(file);
    expect(memFs.read).toHaveBeenCalledOnce();
    expect(memFs.read).toHaveBeenCalledWith(file);
  });

  it('return defaults if file does not exist and defaults is provided', () => {
    expect(memFs.readJSON(getFixture('no-such-file.json'), { foo: 'bar' })).toEqual({
      foo: 'bar',
    });
  });

  it('throw error if file could not be parsed as JSON, even if defaults is provided', () => {
    expect(() => {
      memFs.readJSON(getFixture('file-tpl.txt'), {
        foo: 'bar',
      });
    }).toThrow();
  });

  it('throw error with file path info', () => {
    const filePath = getFixture('file-tpl.txt');
    expect(() => {
      // @ts-expect-error - Expecting it to throw
      memFs.readJSON(new RegExp(escape(filePath), 'v'));
    }).toThrow();
  });
});
