import { EventEmitter } from 'events';
import path = require('path');
import vinylFile = require('vinyl-file');
import File = require('vinyl');
import { PassThrough } from 'stream';

function createFile(filepath: string) {
  return new File({
    cwd: process.cwd(),
    base: process.cwd(),
    path: filepath,
    contents: null
  });
}

export class Store extends EventEmitter {
  private store: Record<string, File> = {};

  private load(filepath: string): File {
    let file: File;
    try {
      file = vinylFile.readSync(filepath);
    } catch (err) {
      file = createFile(filepath);
    }
    this.store[filepath] = file;
    return file;
  }

  get(filepath: string): File {
    filepath = path.resolve(filepath);
    return this.store[filepath] || this.load(filepath);
  }

  existsInMemory(filepath: string): boolean {
    filepath = path.resolve(filepath);
    return !!this.store[filepath];
  }

  add(file: File): this {
    this.store[file.path] = file;
    this.emit('change', file.path);
    return this;
  }

  each(onEach: (file: File, index: number) => void): this {
    Object.keys(this.store).forEach((key, index) => {
      onEach(this.store[key], index);
    });
    return this;
  }

  all(): File[] {
    return Object.values(this.store);
  }

  stream(): PassThrough {
    const stream = new PassThrough({ objectMode: true, autoDestroy: true });
    setImmediate(() => {
      this.each((file: File) => stream.write(file));
      stream.end();
    });

    return stream;
  }
}

export function create(): Store {
  return new Store();
};
