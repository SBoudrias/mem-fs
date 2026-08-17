import fs from 'node:fs';
import path from 'node:path';
import { Duplex } from 'node:stream';
import os from 'node:os';
import { describe, beforeEach, it, expect, afterEach, vi } from 'vitest';
import { create as createMemFs } from 'mem-fs';
import { type MemFsEditor, type MemFsEditorFile, create } from '../src/index.ts';
import { getFixture } from './fixtures.ts';
import { isFilePending } from '../src/state.ts';

describe('#commit()', () => {
  const fixtureDir = path.join(os.tmpdir(), '/mem-fs-editor-test-fixture');
  const output = path.join(os.tmpdir(), `/mem-fs-editor-test${String(Math.random())}`);
  const NUMBER_FILES = 100;

  let memFs: MemFsEditor;

  beforeEach(() => {
    memFs = create(createMemFs<MemFsEditorFile>());
    fs.mkdirSync(fixtureDir, { recursive: true });

    // Create a 100 files to exercise the stream high water mark
    for (let i = 0; i < NUMBER_FILES; i++) {
      fs.writeFileSync(path.join(fixtureDir, `file-${String(i)}.txt`), 'foo');
    }

    memFs.copy(`${fixtureDir}/**`, output);
  });

  afterEach(() => {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
    fs.rmSync(output, { recursive: true, force: true });
  });

  it('should match snapshot', async () => {
    await memFs.commit();
    expect(memFs.dump(output)).toMatchSnapshot();
  });

  it('call filters and trigger callback on error', async () => {
    let called = 0;

    // oxlint-disable-next-line eslint/require-yield
    const filter = Duplex.from(async function* filter(
      generator: AsyncIterable<MemFsEditorFile>,
    ) {
      // oxlint-disable-next-line eslint/no-unreachable-loop, typescript/no-unused-vars
      for await (const _file of generator) {
        called += 1;
        throw new Error(`error ${String(called)}`);
      }
    });

    await expect(memFs.commit(filter)).rejects.toThrow(/error 1/v);
  });

  it('call filters and update memory model', async () => {
    let called = 0;

    await memFs.commit(
      Duplex.from(async function* modifyFiles(generator: AsyncIterable<MemFsEditorFile>) {
        for await (const file of generator) {
          called += 1;
          file.contents = Buffer.from('modified');
          yield file;
        }
      }),
    );

    expect(called).toBe(100);
    expect(memFs.read(path.join(output, 'file-1.txt'))).toBe('modified');
  });

  it('call filters, update memory model and commit selected files', async () => {
    let called = 0;

    await memFs.commit(
      { filter: (file) => file.path.endsWith('1.txt') && isFilePending(file) },
      Duplex.from(async function* modifyFiles(generator: AsyncIterable<MemFsEditorFile>) {
        for await (const file of generator) {
          called += 1;
          file.contents = Buffer.from('modified');
          yield file;
        }
      }),
    );
    expect(called).toBe(10);
    expect(memFs.read(path.join(output, 'file-1.txt'))).toBe('modified');
    expect(memFs.read(path.join(output, 'file-2.txt'))).not.toBe('modified');
    expect(memFs.store.get(path.join(output, 'file-1.txt')).committed).toBeTruthy();
    expect(memFs.store.get(path.join(output, 'file-2.txt'))['result']).toBeUndefined();
  });

  it('write file to disk', async () => {
    await memFs.commit();
    expect(fs.existsSync(path.join(output, 'file-1.txt'))).toBeTruthy();
    expect(fs.existsSync(path.join(output, 'file-1.txt'))).toBeTruthy();
    expect(fs.existsSync(path.join(output, 'file-50.txt'))).toBeTruthy();
    expect(fs.existsSync(path.join(output, 'file-99.txt'))).toBeTruthy();
  }, 10_000);

  it('handle error when write fails', async () => {
    fs.writeFileSync(output, 'foo');
    await expect(memFs.commit()).rejects.toThrow(/is not a directory/v);
  });

  it('delete file from disk', async () => {
    const file = path.join(output, 'delete.txt');
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(file, 'to delete');

    memFs.delete(file);
    await memFs.commit();
    expect(fs.existsSync(file)).toBeFalsy();
    expect(memFs.store.get(file).committed).toBeTruthy();
  });

  it('delete directories from disk', async () => {
    const file = path.join(output, 'nested/delete.txt');
    fs.mkdirSync(path.join(output, 'nested'), { recursive: true });
    fs.writeFileSync(file, 'to delete');

    memFs.delete(path.join(output, 'nested'));
    await memFs.commit();
    expect(fs.existsSync(file)).toBeFalsy();
  });

  it('reset file status after commiting', async () => {
    await memFs.commit();
    expect(memFs.store.get(path.join(output, '/file-a.txt')).state).toBeUndefined();
  });

  it('does not commit files who are deleted before being commited', async () => {
    memFs.write('to-delete', 'foo');
    memFs.delete('to-delete');
    memFs.copy(getFixture('file-a.txt'), 'copy-to-delete');
    memFs.delete('copy-to-delete');
    memFs.store.get('to-delete');

    const writeFile = vi.spyOn(fs.promises, 'writeFile');

    await memFs.commit({ filter: () => true });

    expect(writeFile).toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalledWith(
      path.resolve('to-delete'),
      expect.anything(),
      expect.anything(),
    );
  });

  it('does not pass files who are deleted before being commited through the pipeline', async () => {
    memFs.write('to-delete', 'foo');
    memFs.delete('to-delete');
    memFs.copy(getFixture('file-a.txt'), 'copy-to-delete');
    memFs.delete('copy-to-delete');
    memFs.store.get('to-delete');

    await memFs.commit(
      Duplex.from(async function* assertNotDeleted(
        generator: AsyncIterable<MemFsEditorFile>,
      ) {
        for await (const file of generator) {
          expect(file.path).not.toEqual(path.resolve('to-delete'));
          expect(file.path).not.toEqual(path.resolve('copy-to-delete'));
          yield file;
        }
      }),
    );
  });
});

describe('#copy() and #commit()', () => {
  const output = path.join(os.tmpdir(), '/mem-fs-editor-test');

  let memFs: MemFsEditor;

  beforeEach(() => {
    memFs = create(createMemFs<MemFsEditorFile>());

    memFs.copy(getFixture('**'), output);
  });

  afterEach(() => {
    fs.rmSync(output, { recursive: true, force: true });
  });

  it('should match snapshot', async () => {
    await memFs.commit();
    expect(memFs.dump(output)).toMatchSnapshot();
  });
});

describe('#copyTpl() and #commit()', () => {
  const output = path.join(os.tmpdir(), '/mem-fs-editor-test');

  let memFs: MemFsEditor;

  beforeEach(() => {
    memFs = create(createMemFs<MemFsEditorFile>());

    type CircularContext = {
      name?: string;
      a?: CircularContext;
      b?: CircularContext;
    };
    const a: CircularContext = { name: 'foo' };
    const b = { a };
    a.b = b;

    memFs.copyTpl(
      getFixture('**'),
      output,
      { name: 'bar' },
      { transformOptions: { context: { a } } },
    );
  });

  afterEach(() => {
    fs.rmSync(output, { recursive: true, force: true });
  });

  it('should match snapshot', async () => {
    await memFs.commit();
    expect(memFs.dump(output)).toMatchSnapshot();
  });
});
