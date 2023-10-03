import { EventEmitter } from 'events';
import path from 'path';
import { vinylFileSync } from 'vinyl-file';
import File from 'vinyl';
import { type PipelineTransform, Readable, Duplex } from 'stream';
import { pipeline } from 'stream/promises';

export type FileTransform<File> = PipelineTransform<PipelineTransform<any, File>, File>;

export const isFileTransform = (transform: any) =>
  typeof transform === 'function' || 'readable' in transform || 'writable' in transform;

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

  // eslint-disable-next-line lines-between-class-members
  pipeline(
    options: StreamOptions<StoreFile>,
    ...transforms: FileTransform<StoreFile>[]
  ): Promise<void>;
  // eslint-disable-next-line lines-between-class-members
  pipeline(...transforms: FileTransform<StoreFile>[]): Promise<void>;
  async pipeline(
    options?: StreamOptions<StoreFile> | FileTransform<StoreFile>,
    ...transforms: FileTransform<StoreFile>[]
  ): Promise<void> {
    const newStore = new Map<string, StoreFile>();
    let filter: ((file: StoreFile) => boolean) | undefined;
    if (options && isFileTransform(options)) {
      transforms = [options as FileTransform<StoreFile>, ...transforms];
    } else if (options) {
      filter = (options as StreamOptions<StoreFile>).filter;
    }

    filter = filter ?? (transforms.length === 0 ? () => false : () => true);

    function* iterablefilter(iterable: IterableIterator<StoreFile>) {
      for (const item of iterable) {
        if (filter!(item)) {
          yield item;
        } else {
          newStore.set(item.path, item);
        }
      }
    }

    await pipeline(
      Readable.from(iterablefilter(this.store.values())) as any,
      ...(transforms as any),
      // eslint-disable-next-line require-yield
      Duplex.from(async (generator: AsyncGenerator<StoreFile>) => {
        for await (const file of generator) {
          newStore.set(file.path, file);
        }
      })
    );

    this.store = newStore;
  }
}

export function create<StoreFile extends { path: string } = File>(): Store<StoreFile> {
  return new Store<StoreFile>();
}
