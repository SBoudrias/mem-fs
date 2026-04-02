import { EventEmitter } from 'events';
import path from 'path';
import { vinylFile, vinylFileSync } from 'vinyl-file';
import File from 'vinyl';
import { type PipelineTransform, Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import fs from 'node:fs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FileTransform<File> = PipelineTransform<PipelineTransform<any, File>, File>;

export type StreamOptions<StoreFile extends { path: string } = File> = {
  filter?: (file: StoreFile) => boolean;
};

export type PipelineOptions<StoreFile extends { path: string } = File> = {
  filter?: (file: StoreFile) => boolean;
  resolveConflict?: (current: StoreFile, newFile: StoreFile) => StoreFile;
  refresh?: boolean;
  allowOverride?: boolean;
};

export function isFileTransform<StoreFile extends { path: string } = File>(
  transform: PipelineOptions<StoreFile> | FileTransform<StoreFile> | undefined,
): transform is FileTransform<StoreFile> {
  return (
    typeof transform === 'function' ||
    (typeof transform === 'object' &&
      ('readable' in transform || 'writable' in transform))
  );
}

export function loadFile(filepath: string): File {
  const stat = fs.statSync(filepath, { throwIfNoEntry: false });
  if (stat?.isDirectory?.()) {
    return new File({
      cwd: process.cwd(),
      base: process.cwd(),
      path: filepath,
      stat,
      contents: null,
    }) as unknown as File;
  }

  try {
    return vinylFileSync(filepath) as unknown as File;
  } catch {
    return new File({
      cwd: process.cwd(),
      base: process.cwd(),
      path: filepath,
      contents: null,
    }) as unknown as File;
  }
}

export async function loadFileAsync(filepath: string): Promise<File> {
  try {
    const stat = await fs.promises.stat(filepath);
    if (stat?.isDirectory?.()) {
      return new File({
        cwd: process.cwd(),
        base: process.cwd(),
        path: filepath,
        stat,
        contents: null,
      }) as unknown as File;
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== 'ENOENT') {
      // Preserve behavior of loadFile (sync) for non-ENOENT errors.
      throw error;
    }
    // File does not exist; any other error will be handled later.
  }

  try {
    return (await vinylFile(filepath)) as unknown as File;
  } catch {
    return new File({
      cwd: process.cwd(),
      base: process.cwd(),
      path: filepath,
      contents: null,
    }) as unknown as File;
  }
}

export class Store<StoreFile extends { path: string } = File> extends EventEmitter {
  public loadFile: (filepath: string) => StoreFile;
  public loadFileAsync: (filepath: string) => Promise<StoreFile>;
  private store = new Map<string, StoreFile>();
  private asyncStore = new Map<string, Promise<StoreFile>>();

  constructor(options?: {
    loadFile?: (filepath: string) => StoreFile;
    loadFileAsync?: (filepath: string) => Promise<StoreFile>;
  }) {
    super();
    const { loadFile: customLoadFile, loadFileAsync: customLoadFileAsync } =
      options ?? {};
    this.loadFile =
      customLoadFile ?? (loadFile as unknown as (filepath: string) => StoreFile);
    this.loadFileAsync =
      customLoadFileAsync ??
      (loadFileAsync as unknown as (filepath: string) => Promise<StoreFile>);
  }

  private load(filepath: string): StoreFile {
    const file: StoreFile = this.loadFile(filepath);
    this.store.set(filepath, file);
    return file;
  }

  private async loadAsync(filepath: string): Promise<StoreFile> {
    const file: StoreFile = await this.loadFileAsync(filepath);
    this.store.set(filepath, file);
    return file;
  }

  get(filepath: string, opts?: { async?: false }): StoreFile;
  get(filepath: string, opts: { async: true }): Promise<StoreFile>;
  get(filepath: string, opts?: { async?: boolean }): StoreFile | Promise<StoreFile> {
    filepath = path.resolve(filepath);
    if (opts?.async) {
      if (this.store.has(filepath)) {
        return Promise.resolve(this.store.get(filepath)!);
      }

      if (this.asyncStore.has(filepath)) {
        return this.asyncStore.get(filepath)!;
      }

      this.asyncStore.set(
        filepath,
        this.loadAsync(filepath).finally(() => this.asyncStore.delete(filepath)),
      );
      return this.asyncStore.get(filepath)!;
    }

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
    let resolveConflict:
      | ((current: StoreFile, newFile: StoreFile) => StoreFile)
      | undefined;
    let refresh = true;

    if (isFileTransform<StoreFile>(options)) {
      transforms = [options, ...transforms];
    } else if (options) {
      filter = options.filter;
      if (options.refresh !== undefined) {
        refresh = options.refresh;
      }

      if (options.resolveConflict !== undefined) {
        resolveConflict = options.resolveConflict;
      } else if (options.allowOverride !== undefined) {
        resolveConflict = (_current, newFile) => newFile;
      }
    }

    const newStore = refresh ? new Map<string, StoreFile>() : undefined;
    const fileFilter = filter ?? (transforms.length === 0 ? () => false : () => true);

    const addFile = newStore
      ? (file: StoreFile) => {
          const currentFile = newStore.get(file.path);
          if (currentFile) {
            if (!resolveConflict) {
              throw new Error(`Duplicated file ${file.path} was emitted.`);
            }

            file = resolveConflict(currentFile, file);
          }

          newStore.set(file.path, file);
        }
      : undefined;

    function* iterablefilter(iterable: IterableIterator<StoreFile>) {
      for (const item of iterable) {
        if (fileFilter(item)) {
          yield item;
        } else {
          addFile?.(item);
        }
      }
    }

    await pipeline(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Readable.from(iterablefilter(this.store.values())) as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(transforms as any),
      new Transform({
        objectMode: true,
        transform(file: StoreFile, _encoding, callback) {
          addFile?.(file);
          callback(null);
        },
      }),
    );

    if (newStore) {
      const oldStore = this.store;
      this.store = newStore;

      for (const file of this.store.keys()) {
        if (oldStore.has(file)) {
          const newFile = this.store.get(file);
          const oldFile = oldStore.get(file);
          oldStore.delete(file);
          if (newFile !== oldFile) {
            this.emit('change', file);
          }
        } else {
          this.emit('change', file);
        }
      }

      for (const oldFile of oldStore.keys()) {
        this.emit('change', oldFile);
      }
    }
  }
}

export function create<StoreFile extends { path: string } = File>(): Store<StoreFile> {
  return new Store<StoreFile>();
}
