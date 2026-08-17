import { describe, beforeEach, it, expect, vi } from 'vitest';
import assert from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import File from 'vinyl';

import { create, type Store } from '../src/index.ts';
import { Duplex } from 'node:stream';

const fixtureA = 'fixtures/file-a.txt';
const fixtureB = 'fixtures/file-b.txt';
const absentFile = 'fixture/does-not-exist.txt';
const coffeeFile = new File({
  cwd: '/',
  base: '/test/',
  path: '/test/file.coffee',
  contents: Buffer.from('test = 123'),
});

// The pipeline() tests deliberately reach into the store's private internal
// map to verify whether pipeline() replaced it.
const internalStoreMap = (store: Store): Map<string, File> =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  (store as unknown as { store: Map<string, File> }).store;

describe('mem-fs', () => {
  let store: Store;

  beforeEach(() => {
    process.chdir(import.meta.dirname);
    store = create();
  });

  it('forwards errors from loadFileAsync', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'mfe-'));
    const filepath = path.join(dir, 'file.txt');
    writeFileSync(filepath, 'content');
    await expect(store.getAsync(path.join(filepath, 'nested'))).rejects.toThrow();
    rmSync(dir, { recursive: true, force: true });
  });

  it('deduplicates concurrent async loads', async () => {
    const [file1, file2] = await Promise.all([
      store.getAsync(fixtureA),
      store.getAsync(fixtureA),
    ]);
    expect(file1).toBe(file2);
  });

  it('async call should load from memory if file is already loaded', async () => {
    const syncFile = store.get(fixtureA);
    const asyncFile = await store.getAsync(fixtureA);
    expect(asyncFile).toBe(syncFile);
  });

  describe('#get() / #add() / #existsInMemory()', () => {
    it('load file from disk', () => {
      const file = store.get(fixtureA);
      assert.deepEqual(file.contents, Buffer.from('foo\n'));
      assert.equal(file.cwd, process.cwd());
      assert.equal(file.base, process.cwd());
      assert.equal(file.relative, fixtureA);
      assert.equal(file.path, path.resolve(fixtureA));
    });

    it('load file from disk (async)', async () => {
      const file = await store.getAsync(fixtureA);
      assert.deepEqual(file.contents, Buffer.from('foo\n'));
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
      await store.getAsync(fixtureA);
      const exists = store.existsInMemory(fixtureA);
      assert.equal(exists, true);
    });

    it('get/modify/add a file', () => {
      const file = store.get(fixtureA);
      file.contents = Buffer.from('bar');
      store.add(file);
      const file2 = store.get(fixtureA);
      assert.deepEqual(file2.contents, Buffer.from('bar'));
    });

    it('retrieve file from memory', () => {
      store.add(coffeeFile);
      const file = store.get('/test/file.coffee');
      assert.deepEqual(file.contents, Buffer.from('test = 123'));
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
      const file = await store.getAsync(absentFile);
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
            assert.deepEqual(file.contents, Buffer.from('test = 123'));
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

        stream.on('data', (file: File) => {
          const expected = files[index];
          if (expected == null) {
            throw new Error('Received more files than expected');
          }

          assert.equal(path.resolve(expected), file.path);
          index += 1;
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

        stream.on('data', (file: File) => {
          const expected = files[index];
          if (expected == null) {
            throw new Error('Received more files than expected');
          }

          assert.equal(path.resolve(expected), file.path);
          index += 1;
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
      const oldStore = internalStoreMap(store);

      await store.pipeline();

      expect(oldFiles).toEqual(store.all());
      expect(oldStore).not.toBe(internalStoreMap(store));
    });

    it('creates a new store with updated files', async () => {
      const fileB = store.get(fixtureB);
      fileB.path += '.renamed';

      await store.pipeline();

      expect(store.existsInMemory(fixtureB)).toBeFalsy();
      expect(store.existsInMemory(`${fixtureB}.renamed`)).toBeTruthy();
    });

    it('creates a new store with filtered files', async () => {
      await store.pipeline(
        { filter: (file) => file.path.includes(fixtureB) },
        Duplex.from(async (generator: AsyncIterable<File>) => {
          for await (const _file of generator) {
            // Remove all files
          }
        }),
      );

      expect(store.existsInMemory(fixtureA)).toBeTruthy();
      expect(store.existsInMemory(fixtureB)).toBeFalsy();
    });

    it('does not create a new map if refresh is disabled', async () => {
      const oldStore = internalStoreMap(store);

      await store.pipeline(
        { refresh: false },
        Duplex.from(async (generator: AsyncIterable<File>) => {
          for await (const _file of generator) {
            // Remove all files
          }
        }),
      );

      expect(store.existsInMemory(fixtureA)).toBeTruthy();
      expect(store.existsInMemory(fixtureB)).toBeTruthy();
      expect(oldStore).toBe(internalStoreMap(store));
    });

    it('options should be optional', async () => {
      await store.pipeline(
        Duplex.from(async (generator: AsyncIterable<File>) => {
          for await (const _file of generator) {
            // Remove all files
          }
        }),
      );

      expect(store.existsInMemory(fixtureA)).toBeFalsy();
      expect(store.existsInMemory(fixtureB)).toBeFalsy();
    });

    it('emits events', async () => {
      const listener = vi.fn<(path: string) => void>();
      store.on('change', listener);

      const fileB = store.get(fixtureB);
      fileB.path += '.renamed';

      await store.pipeline(
        Duplex.from(async function* transformFiles(generator: AsyncIterable<File>) {
          for await (const file of generator) {
            yield file.path.endsWith('.renamed') ? file : file.clone();
          }
        }),
      );

      expect(listener).toHaveBeenCalled();
      // Emits event for files only in oldStore
      expect(listener).toHaveBeenCalledWith(path.resolve(fixtureB));
      // Emits event for files only in newStore
      expect(listener).toHaveBeenCalledWith(path.resolve(`${fixtureB}.renamed`));
      // Emits event for changed file
      expect(listener).toHaveBeenCalledWith(path.resolve(fixtureA));
    });

    describe('allowOverride option', () => {
      it('throws on duplicated files by default', async () => {
        const fileA = store.get(fixtureA);
        const fileB = store.get(fixtureB);
        fileB.path = fileA.path;

        await expect(store.pipeline()).rejects.toThrow(/^Duplicated file/v);
      });

      it('overrides duplicated files', async () => {
        const fileA = store.get(fixtureA);
        const fileB = store.get(fixtureB);
        fileB.path = fileA.path;

        await store.pipeline({ allowOverride: true });

        expect(store.existsInMemory(fixtureA)).toBeTruthy();
        expect(store.existsInMemory(fixtureB)).toBeFalsy();
        expect(store.get(fixtureA).contents).toStrictEqual(Buffer.from('foo2\n'));
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
        expect(store.get(fixtureA).contents).toStrictEqual(Buffer.from('foo\n'));
      });
    });
  });
});
