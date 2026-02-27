import { describe, beforeEach, it, expect, vi } from 'vitest';
import assert from 'assert';
import path, { resolve } from 'path';
import File from 'vinyl';

import { create, Store } from '../src/index';
import { Duplex } from 'stream';
import { setTimeout } from 'timers/promises';

const fixtureA = 'fixtures/file-a.txt';
const fixtureB = 'fixtures/file-b.txt';
const absentFile = 'fixture/does-not-exist.txt';
const coffeeFile = new File({
  cwd: '/',
  base: '/test/',
  path: '/test/file.coffee',
  contents: Buffer.from('test = 123'),
});

describe('mem-fs', () => {
  let store: Store;

  beforeEach(() => {
    process.chdir(__dirname);
    store = create();
  });

  it('accepts loadFileOption', () => {
    const customLoader = new Store<{ path: string; contents: Buffer }>({
      loadFile: (filepath) => ({
        path: resolve(filepath),
        contents: Buffer.from('a content'),
      }),
    });
    expect(customLoader.get('foo.txt').contents.toString()).toMatch('a content');
  });

  it('forwards errors from loadFile', () => {
    const error = new Error('Sync error');
    const customLoader = new Store<{ path: string; contents: Buffer }>({
      loadFile() {
        throw error;
      },
    });
    expect(() => customLoader.get('foo.txt')).toThrow(error);
  });

  it('accepts loadFileAsyncOption', async () => {
    const customLoader = new Store<{ path: string; contents: Buffer }>({
      loadFileAsync: (filepath) =>
        Promise.resolve({
          path: resolve(filepath),
          contents: Buffer.from('a content'),
        }),
    });
    expect(
      (await customLoader.get('foo.txt', { async: true })).contents.toString(),
    ).toMatch('a content');
  });

  it('forwards errors from loadFileAsync', async () => {
    const error = new Error('Async error');
    const customLoader = new Store<{ path: string; contents: Buffer }>({
      loadFileAsync: () => Promise.reject(error),
    });
    expect(customLoader.get('foo.txt', { async: true })).rejects.toThrow(error);
  });

  it('consecutive async calls should not call loadFileAsync multiple times', async () => {
    let loadFileCalled = false;
    const customLoader = new Store<{ path: string; contents: Buffer }>({
      async loadFileAsync(filepath) {
        if (!loadFileCalled) {
          loadFileCalled = true;
          await setTimeout(100);
          return {
            path: resolve(filepath),
            contents: Buffer.from('a content'),
          };
        }

        throw new Error('Should not be called again');
      },
    });
    const readFile = () =>
      customLoader
        .get('foo.txt', { async: true })
        .then((file) => file.contents.toString());
    await expect(Promise.all([readFile(), readFile()])).resolves.toMatchObject([
      'a content',
      'a content',
    ]);
  });

  it('async call should load from memory if file is already loaded', async () => {
    const customLoader = new Store<{ path: string; contents: Buffer }>({
      loadFile(filepath) {
        return {
          path: resolve(filepath),
          contents: Buffer.from('a content'),
        };
      },
      async loadFileAsync() {
        throw new Error('Should not be called');
      },
    });
    customLoader.get('foo.txt');
    expect(
      (await customLoader.get('foo.txt', { async: true })).contents.toString(),
    ).toMatch('a content');
  });

  describe('#get() / #add() / #existsInMemory()', () => {
    it('load file from disk', () => {
      const file = store.get(fixtureA);
      assert.equal(file.contents?.toString(), 'foo\n');
      assert.equal(file.cwd, process.cwd());
      assert.equal(file.base, process.cwd());
      assert.equal(file.relative, fixtureA);
      assert.equal(file.path, path.resolve(fixtureA));
    });

    it('load file from disk (async)', async () => {
      const file = await store.get(fixtureA, { async: true });
      assert.equal(file.contents?.toString(), 'foo\n');
      assert.equal(file.cwd, process.cwd());
      assert.equal(file.base, process.cwd());
      assert.equal(file.relative, fixtureA);
      assert.equal(file.path, path.resolve(fixtureA));
    });

    it('file should not exist in memory', () => {
      const exists = store.existsInMemory(fixtureA);
      assert.equal(exists, false);
    });

    it('file should exist in memory after getting it', () => {
      store.get(fixtureA);
      const exists = store.existsInMemory(fixtureA);
      assert.equal(exists, true);
    });

    it('file should exist in memory after getting it (async)', async () => {
      await store.get(fixtureA, { async: true });
      const exists = store.existsInMemory(fixtureA);
      assert.equal(exists, true);
    });

    it('get/modify/add a file', () => {
      const file = store.get(fixtureA);
      file.contents = Buffer.from('bar');
      store.add(file);
      const file2 = store.get(fixtureA);
      assert.equal(file2.contents?.toString(), 'bar');
    });

    it('retrieve file from memory', () => {
      store.add(coffeeFile);
      const file = store.get('/test/file.coffee');
      assert.equal(file.contents?.toString(), 'test = 123');
    });

    it('returns empty file reference if file does not exist', () => {
      const file = store.get(absentFile);
      assert.equal(file.contents, null);
      assert.equal(file.cwd, process.cwd());
      assert.equal(file.base, process.cwd());
      assert.equal(file.relative, absentFile);
      assert.equal(file.path, path.resolve(absentFile));
    });

    it('returns empty file reference if file does not exist (async)', async () => {
      const file = await store.get(absentFile, { async: true });
      assert.equal(file.contents, null);
      assert.equal(file.cwd, process.cwd());
      assert.equal(file.base, process.cwd());
      assert.equal(file.relative, absentFile);
      assert.equal(file.path, path.resolve(absentFile));
    });
  });

  describe('#add()', () => {
    it('is chainable', () => {
      assert.equal(store.add(coffeeFile), store);
    });

    describe('change event', () => {
      it('is triggered', () =>
        new Promise<void>((resolve) => {
          store.on('change', () => {
            const file = store.get('/test/file.coffee');
            assert.equal(file.contents?.toString(), 'test = 123');
            resolve();
          });

          store.add(coffeeFile);
        }));

      it('passes the file name to the listener', () =>
        new Promise<void>((resolve) => {
          store.on('change', (eventFile) => {
            assert.equal(eventFile, coffeeFile.path);
            resolve();
          });
          store.add(coffeeFile);
        }));
    });
  });

  describe('#each()', () => {
    beforeEach(() => {
      store.get(fixtureA);
      store.get(fixtureB);
    });

    it('iterates over every file', () => {
      const files: string[] = [fixtureA, fixtureB];
      const eachFiles: string[] = [];
      store.each((file) => {
        eachFiles.push(file.path);
      });
      expect(eachFiles).toMatchObject(files.map((file) => path.resolve(file)));
    });

    it('is chainable', () => {
      assert.equal(
        store.each(() => {
          // Empty
        }),
        store,
      );
    });
  });

  describe('#all()', () => {
    beforeEach(() => {
      store.get(fixtureA);
      store.get(fixtureB);
    });

    it('returns an array of every file contained', () => {
      assert.deepEqual(store.all(), [store.get(fixtureA), store.get(fixtureB)]);
    });
  });

  describe('#stream()', () => {
    beforeEach(() => {
      store.get(fixtureA);
      store.get(fixtureB);
    });

    it('returns an object stream for each file contained', () =>
      new Promise<void>((resolve) => {
        let index = 0;
        const files = [fixtureA, fixtureB];
        const stream = store.stream();

        stream.on('data', (file) => {
          assert.equal(path.resolve(files[index]), file.path);
          index++;
        });

        stream.on('end', () => {
          assert.equal(index, 2);
          resolve();
        });
      }));

    it('returns an object stream for each filtered file', () =>
      new Promise<void>((resolve) => {
        let index = 0;
        const files = [fixtureA, fixtureB];
        const stream = store.stream({
          filter: (file) => file.path.endsWith('file-a.txt'),
        });

        stream.on('data', (file) => {
          assert.equal(path.resolve(files[index]), file.path);
          index++;
        });

        stream.on('end', () => {
          assert.equal(index, 1);
          resolve();
        });
      }));
  });

  describe('#pipeline()', () => {
    beforeEach(() => {
      store.get(fixtureA);
      store.get(fixtureB);
    });

    it('creates a new store with all same files', async () => {
      const oldFiles = store.all();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const oldStore = (store as any).store;

      await store.pipeline();

      expect(oldFiles).toEqual(store.all());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(oldStore).not.toBe((store as any).store);
    });

    it('creates a new store with updated files', async () => {
      const fileB = store.get(fixtureB);
      fileB.path += '.renamed';

      await store.pipeline();

      expect(store.existsInMemory(fixtureB)).toBeFalsy();
      expect(store.existsInMemory(fixtureB + '.renamed')).toBeTruthy();
    });

    it('creates a new store with filtered files', async () => {
      await store.pipeline(
        { filter: (file) => file.path.includes(fixtureB) },
        Duplex.from(async (generator: AsyncGenerator<File>) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _file of generator) {
            // Remove all files
          }
        }),
      );

      expect(store.existsInMemory(fixtureA)).toBeTruthy();
      expect(store.existsInMemory(fixtureB)).toBeFalsy();
    });

    it('does not create a new map if refresh is disabled', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const oldStore = (store as any).store;

      await store.pipeline(
        { refresh: false },
        Duplex.from(async (generator: AsyncGenerator<File>) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _file of generator) {
            // Remove all files
          }
        }),
      );

      expect(store.existsInMemory(fixtureA)).toBeTruthy();
      expect(store.existsInMemory(fixtureB)).toBeTruthy();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(oldStore).toBe((store as any).store);
    });

    it('options should be optional', async () => {
      await store.pipeline(
        Duplex.from(async (generator: AsyncGenerator<File>) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _file of generator) {
            // Remove all files
          }
        }),
      );

      expect(store.existsInMemory(fixtureA)).toBeFalsy();
      expect(store.existsInMemory(fixtureB)).toBeFalsy();
    });

    it('emits events', async () => {
      const listener = vi.fn();
      store.on('change', listener);

      const fileB = store.get(fixtureB);
      fileB.path += '.renamed';

      await store.pipeline(
        Duplex.from(async function* (generator: AsyncGenerator<File>) {
          for await (const file of generator) {
            if (file.path.endsWith('.renamed')) {
              yield file;
            } else {
              yield file.clone();
            }
          }
        }),
      );

      expect(listener).toBeCalled();
      // Emits event for files only in oldStore
      expect(listener).toBeCalledWith(resolve(fixtureB));
      // Emits event for files only in newStore
      expect(listener).toBeCalledWith(resolve(fixtureB + '.renamed'));
      // Emits event for changed file
      expect(listener).toBeCalledWith(resolve(fixtureA));
    });

    describe('allowOverride option', () => {
      it('throws on duplicated files by default', async () => {
        const fileA = store.get(fixtureA);
        const fileB = store.get(fixtureB);
        fileB.path = fileA.path;

        await expect(store.pipeline()).rejects.toThrowError(/^Duplicated file/v);
      });

      it('overrides duplicated files', async () => {
        const fileA = store.get(fixtureA);
        const fileB = store.get(fixtureB);
        fileB.path = fileA.path;

        await store.pipeline({ allowOverride: true });

        expect(store.existsInMemory(fixtureA)).toBeTruthy();
        expect(store.existsInMemory(fixtureB)).toBeFalsy();
        expect(store.get(fixtureA).contents?.toString()).toMatch('foo2');
      });
    });

    describe('resolveConflict option', () => {
      it('allows to select current file and takes precedence over allowOverride', async () => {
        const fileA = store.get(fixtureA);
        const fileB = store.get(fixtureB);
        fileB.path = fileA.path;

        await store.pipeline({
          resolveConflict: (current) => current,
          allowOverride: true,
        });

        expect(store.existsInMemory(fixtureA)).toBeTruthy();
        expect(store.existsInMemory(fixtureB)).toBeFalsy();
        expect(store.get(fixtureA).contents?.toString()).toMatch('foo');
      });
    });
  });
});
