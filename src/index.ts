import { EventEmitter } from 'events';
import path from 'path';
import { vinylFileSync } from 'vinyl-file';
import File from 'vinyl';
import { type PipelineTransform, Readable, Duplex } from 'stream';
import { pipeline } from 'stream/promises';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FileTransform<File> = PipelineTransform<PipelineTransform<any, File>, File>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isFileTransform = (transform: any) =>
  typeof transform === 'function' ||
  (typeof transform === 'object' && ('readable' in transform || 'writable' in transform));

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

export type PipelineOptions<StoreFile extends { path: string } = File> = {
  filter?: (file: StoreFile) => boolean;
  refresh?: boolean;
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

  async pipeline(
    options?: PipelineOptions<StoreFile> | FileTransform<StoreFile>,
    ...transforms: FileTransform<StoreFile>[]
  ): Promise<void> {
    let filter: ((file: StoreFile) => boolean) | undefined;
    let refresh = true;

    if (options && isFileTransform(options)) {
      transforms = [options as FileTransform<StoreFile>, ...transforms];
    } else if (options) {
      const pipelineOptions = options as PipelineOptions<StoreFile>;
      filter = pipelineOptions.filter;
      if (pipelineOptions.refresh !== undefined) {
        refresh = pipelineOptions.refresh;
      }
    }

    const newStore = refresh ? new Map<string, StoreFile>() : undefined;
    const fileFilter = filter ?? (transforms.length === 0 ? () => false : () => true);

    function* iterablefilter(iterable: IterableIterator<StoreFile>) {
      for (const item of iterable) {
        if (fileFilter(item)) {
          yield item;
        } else {
          newStore?.set(item.path, item);
        }
      }
    }

    await pipeline(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Readable.from(iterablefilter(this.store.values())) as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(transforms as any),
      Duplex.from(async (generator: AsyncGenerator<StoreFile>) => {
        for await (const file of generator) {
          newStore?.set(file.path, file);
        }
      })
    );

    if (newStore) {
      this.store = newStore;
    }
  }
}

export function create<StoreFile extends { path: string } = File>(): Store<StoreFile> {
  return new Store<StoreFile>();
}
