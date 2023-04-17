import { EventEmitter } from 'events';
import path from 'path';
import { vinylFileSync } from 'vinyl-file';
import File from 'vinyl';
import { PassThrough } from 'stream';

type BaseFile = {
  path: string;
}

function createFile(filepath: string) {
  return new File({
    cwd: process.cwd(),
    base: process.cwd(),
    path: filepath,
    contents: null,
  });
}

export type StreamOptions<StoreFile extends BaseFile = File>  = { filter?: (file: StoreFile) => boolean };

export class Store<StoreFile extends BaseFile = File> extends EventEmitter {
  public createFile: (filepath: string) => StoreFile;
  private store: Record<string, StoreFile> = {};

  constructor(options?: { createFile?: (filepath: string) => StoreFile }) {
    super();
    this.createFile = options?.createFile as any ?? createFile;
  }

  private load(filepath: string): StoreFile {
    let file: StoreFile;
    try {
      file = vinylFileSync(filepath) as any;
    } catch (err) {
      file = this.createFile(filepath) as any;
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

export function create<StoreFile extends BaseFile = File>(): Store<StoreFile> {
  return new Store<StoreFile>();
}
