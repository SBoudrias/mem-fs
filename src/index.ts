import events from 'events';
import path from 'path';
import util from 'util';
import vinylFile from 'vinyl-file';
import File from 'vinyl';
import { PassThrough } from 'stream';

export const create = function () {
  var store = {};

  function createFile(filepath) {
    return new File({
      cwd: process.cwd(),
      base: process.cwd(),
      path: filepath,
      contents: null
    });
  }

  function load(filepath) {
    var file;
    try {
      file = vinylFile.readSync(filepath);
    } catch (err) {
      file = createFile(filepath);
    }
    store[filepath] = file;
    return file;
  }

  var Store = function () {
    events.EventEmitter.apply(this, arguments);
  };
  util.inherits(Store, events.EventEmitter);

  Store.prototype.get = function (filepath) {
    filepath = path.resolve(filepath);
    return store[filepath] || load(filepath);
  };

  Store.prototype.existsInMemory = function (filepath) {
    filepath = path.resolve(filepath);
    return !!store[filepath];
  };

  Store.prototype.add = function (file) {
    store[file.path] = file;
    this.emit('change', file.path);
    return this;
  };

  Store.prototype.each = function (onEach) {
    Object.keys(store).forEach(function (key, index) {
      onEach(store[key], index);
    });
    return this;
  };

  Store.prototype.all = function () {
    return Object.values(store);
  };

  Store.prototype.stream = function () {
    const stream = new PassThrough({objectMode: true, autoDestroy: true});
    setImmediate(function () {
      this.each((file) => stream.write(file));
      stream.end();
    }.bind(this));
    return stream;
  };

  return new Store();
};
