import { EventEmitter } from 'events';
import path from 'path';
import { vinylFileSync } from 'vinyl-file';
import File from 'vinyl';
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
  public createFile: (filepath: string) => StoreFile;
  private store: Record<string, StoreFile> = {};

  constructor(options?: { createFile?: (filepath: string) => StoreFile }) {
    super();
    this.createFile = options?.createFile as unknown as (filepath: string) => StoreFile ?? createFile;
  }

  private load(filepath: string): StoreFile {
    let file: StoreFile;
    try {
      file = vinylFileSync(filepath) as unknown as StoreFile;
    } catch (err) {
      file = this.createFile(filepath) as unknown as StoreFile;
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
    return Boolean(this.store[filepath]);
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

export function create<StoreFile extends { path: string; } = File>(): Store<StoreFile> {
  return new Store<StoreFile>();
}
