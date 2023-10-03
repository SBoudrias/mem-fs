import { describe, beforeEach, it, expect } from 'vitest';
import assert from 'assert';
import path from 'path';
import File from 'vinyl';

import { create, Store } from '../src/index';
import { Duplex } from 'stream';

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

  describe('#get() / #add() / #existsInMemory()', () => {
    it('load file from disk', () => {
      const file = store.get(fixtureA);
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
        store
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
      const oldStore = (store as any).store;

      await store.pipeline();

      expect(oldFiles).toEqual(store.all());
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
          for await (const file of generator) {
            // Remove all files
          }
        })
      );

      expect(store.existsInMemory(fixtureA)).toBeTruthy();
      expect(store.existsInMemory(fixtureB)).toBeFalsy();
    });
  });
});