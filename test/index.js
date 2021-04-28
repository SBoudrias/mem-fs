'use strict';

var assert = require('assert');
var path = require('path');
var File = require('vinyl');

var memFs = require('../');

var fixtureA = 'fixtures/file-a.txt';
var fixtureB = 'fixtures/file-b.txt';
var absentFile = 'fixture/does-not-exist.txt';
var coffeeFile = new File({
  cwd: '/',
  base: '/test/',
  path: '/test/file.coffee',
  contents: Buffer.from('test = 123')
});

describe('mem-fs', function () {
  beforeEach(function() {
    process.chdir(__dirname);
    this.store = memFs.create();
  });

  describe('#get() / #add() / #existsInMemory()', function () {
    it('load file from disk', function () {
      var file = this.store.get(fixtureA);
      assert.equal(file.contents.toString(), 'foo\n');
      assert.equal(file.cwd, process.cwd());
      assert.equal(file.base, process.cwd());
      assert.equal(file.relative, fixtureA);
      assert.equal(file.path, path.resolve(fixtureA));
    });

    it('file should not exist in memory', function () {
      var exists = this.store.existsInMemory(fixtureA);
      assert.equal(exists, false);
    });

    it('file should exist in memory after getting it', function () {
      var file = this.store.get(fixtureA);
      var exists = this.store.existsInMemory(fixtureA);
      assert.equal(exists, true);
    });

    it('get/modify/add a file', function () {
      var file = this.store.get(fixtureA);
      file.contents = Buffer.from('bar');
      this.store.add(file);
      var file2 = this.store.get(fixtureA);
      assert.equal(file2.contents.toString(), 'bar');
    });

    it('retrieve file from memory', function () {
      this.store.add(coffeeFile);
      var file = this.store.get('/test/file.coffee');
      assert.equal(file.contents.toString(), 'test = 123');
    });

    it('returns empty file reference if file does not exist', function () {
      var file = this.store.get(absentFile);
      assert.equal(file.contents, null);
      assert.equal(file.cwd, process.cwd());
      assert.equal(file.base, process.cwd());
      assert.equal(file.relative, absentFile);
      assert.equal(file.path, path.resolve(absentFile));
    });
  });

  describe('#add()', function () {
    it('is chainable', function () {
      assert.equal(this.store.add(coffeeFile), this.store);
    });

    describe('change event', () => {
      it('is triggered', function (done) {
        this.store.on('change', function () {
          var file = this.store.get('/test/file.coffee');
          assert.equal(file.contents.toString(), 'test = 123');
          done();
        }.bind(this));
        this.store.add(coffeeFile);
      });

      it('passes the file name to the listener', function (done) {
        this.store.on('change', eventFile => {
          assert.equal(eventFile, coffeeFile.path);
          done();
        });
        this.store.add(coffeeFile);
      });
    });
  });

  describe('#each()', function () {
    beforeEach(function() {
      this.store.get(fixtureA);
      this.store.get(fixtureB);
    });

    it('iterates over every file', function () {
      var files = [fixtureA, fixtureB];
      this.store.each(function (file, index) {
        assert.equal(path.resolve(files[index]), file.path);
      });
    });

    it('is chainable', function () {
      assert.equal(this.store.each(function () {}), this.store);
    });
  });

  describe('#all()', function () {
    beforeEach(function() {
      this.store.get(fixtureA);
      this.store.get(fixtureB);
    });

    it('returns an array of every file contained', function () {
      assert.deepEqual(this.store.all(), [this.store.get(fixtureA), this.store.get(fixtureB)]);
    });
  });

  describe('#stream()', function () {
    beforeEach(function() {
      this.store.get(fixtureA);
      this.store.get(fixtureB);
    });

    it('returns an object stream for each file contained', function (done) {
      var index = 0;
      var files = [fixtureA, fixtureB];
      var stream = this.store.stream()

      stream.on('data', function (file) {
        assert.equal(path.resolve(files[index]), file.path);
        index++;
      });

      stream.on('end', function () {
        assert.equal(index, 2);
        done();
      });
    });
  });
});
