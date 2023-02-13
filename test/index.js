'use strict';

const assert = require('assert');
const path = require('path');
const File = require('vinyl');

const memFs = require('../dist');

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
  beforeEach(function () {
    process.chdir(__dirname);
    this.store = memFs.create();
  });

  describe('#get() / #add() / #existsInMemory()', () => {
    it('load file from disk', function () {
      const file = this.store.get(fixtureA);
      assert.equal(file.contents.toString(), 'foo\n');
      assert.equal(file.cwd, process.cwd());
      assert.equal(file.base, process.cwd());
      assert.equal(file.relative, fixtureA);
      assert.equal(file.path, path.resolve(fixtureA));
    });

    it('file should not exist in memory', function () {
      const exists = this.store.existsInMemory(fixtureA);
      assert.equal(exists, false);
    });

    it('file should exist in memory after getting it', function () {
      this.store.get(fixtureA);
      const exists = this.store.existsInMemory(fixtureA);
      assert.equal(exists, true);
    });

    it('get/modify/add a file', function () {
      const file = this.store.get(fixtureA);
      file.contents = Buffer.from('bar');
      this.store.add(file);
      const file2 = this.store.get(fixtureA);
      assert.equal(file2.contents.toString(), 'bar');
    });

    it('retrieve file from memory', function () {
      this.store.add(coffeeFile);
      const file = this.store.get('/test/file.coffee');
      assert.equal(file.contents.toString(), 'test = 123');
    });

    it('returns empty file reference if file does not exist', function () {
      const file = this.store.get(absentFile);
      assert.equal(file.contents, null);
      assert.equal(file.cwd, process.cwd());
      assert.equal(file.base, process.cwd());
      assert.equal(file.relative, absentFile);
      assert.equal(file.path, path.resolve(absentFile));
    });
  });

  describe('#add()', () => {
    it('is chainable', function () {
      assert.equal(this.store.add(coffeeFile), this.store);
    });

    describe('change event', () => {
      it('is triggered', function (done) {
        this.store.on('change', () => {
          const file = this.store.get('/test/file.coffee');
          assert.equal(file.contents.toString(), 'test = 123');
          done();
        });
        this.store.add(coffeeFile);
      });

      it('passes the file name to the listener', function (done) {
        this.store.on('change', (eventFile) => {
          assert.equal(eventFile, coffeeFile.path);
          done();
        });
        this.store.add(coffeeFile);
      });
    });
  });

  describe('#each()', () => {
    beforeEach(function () {
      this.store.get(fixtureA);
      this.store.get(fixtureB);
    });

    it('iterates over every file', function () {
      const files = [fixtureA, fixtureB];
      this.store.each((file, index) => {
        assert.equal(path.resolve(files[index]), file.path);
      });
    });

    it('is chainable', function () {
      assert.equal(
        this.store.each(() => {}),
        this.store
      );
    });
  });

  describe('#all()', () => {
    beforeEach(function () {
      this.store.get(fixtureA);
      this.store.get(fixtureB);
    });

    it('returns an array of every file contained', function () {
      assert.deepEqual(this.store.all(), [
        this.store.get(fixtureA),
        this.store.get(fixtureB),
      ]);
    });
  });

  describe('#stream()', () => {
    beforeEach(function () {
      this.store.get(fixtureA);
      this.store.get(fixtureB);
    });

    it('returns an object stream for each file contained', function (done) {
      let index = 0;
      const files = [fixtureA, fixtureB];
      const stream = this.store.stream();

      stream.on('data', (file) => {
        assert.equal(path.resolve(files[index]), file.path);
        index++;
      });

      stream.on('end', () => {
        assert.equal(index, 2);
        done();
      });
    });

    it('returns an object stream for each filtered file', function (done) {
      let index = 0;
      const files = [fixtureA, fixtureB];
      const stream = this.store.stream({
        filter: (file) => file.path.endsWith('file-a.txt'),
      });

      stream.on('data', (file) => {
        assert.equal(path.resolve(files[index]), file.path);
        index++;
      });

      stream.on('end', () => {
        assert.equal(index, 1);
        done();
      });
    });
  });
});
