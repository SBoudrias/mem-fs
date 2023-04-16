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
    contents: null,
  });
}

export type StreamOptions<StoreFile extends { path: string; } = File>  = { filter?: (file: StoreFile) => boolean };

export class Store<StoreFile extends { path: string; } = File> extends EventEmitter {
  private store: Record<string, StoreFile> = {};

  private load(filepath: string): StoreFile {
    let file: StoreFile;
    try {
      file = vinylFile.readSync(filepath) as any;
    } catch (err) {
      file = createFile(filepath) as any;
    }
    this.store[filepath] = file;
    return file;
  }

  get(filepath: string): StoreFile {
    filepath = path.resolve(filepath);
    return this.store[filepath] || this.load(filepath);
  }

  existsInMemory(filepath: string): boolean {
    filepath = path.resolve(filepath);
    return !!this.store[filepath];
  }

  add(file: StoreFile): this {
    this.store[file.path] = file;
    this.emit('change', file.path);
    return this;
  }

  each(onEach: (file: StoreFile, index: number) => void): this {
    Object.keys(this.store).forEach((key, index) => {
      onEach(this.store[key], index);
    });
    return this;
  }

  all(): StoreFile[] {
    return Object.values(this.store);
  }

  stream({ filter = () => true }: StreamOptions<StoreFile> = {}): PassThrough {
    const stream = new PassThrough({ objectMode: true, autoDestroy: true });
    setImmediate(() => {
      this.each((file: StoreFile) => filter(file) && stream.write(file));
      stream.end();
    });

    return stream;
  }
}

export function create(): Store {
  return new Store();
}
