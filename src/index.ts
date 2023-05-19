import { EventEmitter } from 'events';
import path from 'path';
import { vinylFileSync } from 'vinyl-file';
import File from 'vinyl';
import { Readable } from 'stream';

function loadFile(filepath: string): File {
  try {
    return vinylFileSync(filepath);
  } catch (err) {
    return new File({
      cwd: process.cwd(),
      base: process.cwd(),
      path: filepath,
      contents: null,
    });
  }
}

export type StreamOptions<StoreFile extends { path: string } = File> = {
  filter?: (file: StoreFile) => boolean;
};

export class Store<StoreFile extends { path: string } = File> extends EventEmitter {
  public loadFile: (filepath: string) => StoreFile;
  private store = new Map<string, StoreFile>();

  constructor(options?: { loadFile?: (filepath: string) => StoreFile }) {
    super();
    this.loadFile =
      options?.loadFile ?? (loadFile as unknown as (filepath: string) => StoreFile);
  }

  private load(filepath: string): StoreFile {
    const file: StoreFile = this.loadFile(filepath);
    this.store.set(filepath, file);
    return file;
  }

  get(filepath: string): StoreFile {
    filepath = path.resolve(filepath);
    return this.store.get(filepath) || this.load(filepath);
  }

  existsInMemory(filepath: string): boolean {
    filepath = path.resolve(filepath);
    return this.store.has(filepath);
  }

  add(file: StoreFile): this {
    this.store.set(file.path, file);
    this.emit('change', file.path);
    return this;
  }

  each(onEach: (file: StoreFile) => void): this {
    this.store.forEach((file) => {
      onEach(file);
    });
    return this;
  }

  all(): StoreFile[] {
    return Array.from(this.store.values());
  }

  stream({ filter = () => true }: StreamOptions<StoreFile> = {}): Readable {
    function* iterablefilter(iterable: IterableIterator<StoreFile>) {
      for (const item of iterable) {
        if (filter(item)) {
          yield item;
        }
      }
    }

    return Readable.from(iterablefilter(this.store.values()));
  }
}

export function create<StoreFile extends { path: string } = File>(): Store<StoreFile> {
  return new Store<StoreFile>();
}
