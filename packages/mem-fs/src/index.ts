import { EventEmitter } from 'node:events';
import path from 'node:path';
import { vinylFile, vinylFileSync } from 'vinyl-file';
import File from 'vinyl';
import { type PipelineTransform, Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import fs from 'node:fs';

export type FileTransform<StoreFile> = PipelineTransform<
  AsyncIterable<StoreFile>,
  StoreFile
>;

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

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

export function loadFile(filepath: string): File {
  const stat = fs.statSync(filepath, { throwIfNoEntry: false });
  if (stat?.isDirectory() === true) {
    return new File({
      cwd: process.cwd(),
      base: process.cwd(),
      path: filepath,
      stat,
      contents: null,
    });
  }

  try {
    return vinylFileSync(filepath);
  } catch {
    return new File({
      cwd: process.cwd(),
      base: process.cwd(),
      path: filepath,
      contents: null,
    });
  }
}

export async function loadFileAsync(filepath: string): Promise<File> {
  try {
    const stat = await fs.promises.stat(filepath);
    if (stat.isDirectory()) {
      return new File({
        cwd: process.cwd(),
        base: process.cwd(),
        path: filepath,
        stat,
        contents: null,
      });
    }
  } catch (error) {
    if (!isErrnoException(error) || error.code !== 'ENOENT') {
      // Preserve behavior of loadFile (sync) for non-ENOENT errors.
      throw error;
    }
    // File does not exist; any other error will be handled later.
  }

  try {
    return await vinylFile(filepath);
  } catch {
    return new File({
      cwd: process.cwd(),
      base: process.cwd(),
      path: filepath,
      contents: null,
    });
  }
}

// EventEmitter is part of the public API (`store.on('change', ...)`)
// oxlint-disable-next-line unicorn/prefer-event-target
export class Store<StoreFile extends { path: string } = File> extends EventEmitter {
  private store = new Map<string, StoreFile>();
  private readonly asyncStore = new Map<string, Promise<StoreFile>>();

  get(filepath: string): StoreFile {
    const resolvedPath = path.resolve(filepath);
    const cached = this.store.get(resolvedPath);
    if (cached) {
      return cached;
    }

    // Disk loads produce vinyl File; StoreFile is a structural { path: string } type.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const file = loadFile(resolvedPath) as File & StoreFile;
    this.store.set(resolvedPath, file);
    return file;
  }

  getAsync(filepath: string): Promise<StoreFile> {
    const resolvedPath = path.resolve(filepath);
    const cached = this.store.get(resolvedPath);
    if (cached) {
      return Promise.resolve(cached);
    }

    const pending = this.asyncStore.get(resolvedPath);
    if (pending) {
      return pending;
    }

    const loading = (async () => {
      try {
        const file = await loadFileAsync(resolvedPath);
        // Disk loads produce vinyl File; StoreFile is a structural { path: string } type.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        const storeFile = file as File & StoreFile;
        this.store.set(resolvedPath, storeFile);
        return storeFile;
      } finally {
        this.asyncStore.delete(resolvedPath);
      }
    })();
    this.asyncStore.set(resolvedPath, loading);
    return loading;
  }

  existsInMemory(filepath: string): boolean {
    return this.store.has(path.resolve(filepath));
  }

  add(file: StoreFile): this {
    this.store.set(file.path, file);
    this.emit('change', file.path);
    return this;
  }

  each(onEach: (file: StoreFile) => void): this {
    for (const file of this.store.values()) {
      onEach(file);
    }

    return this;
  }

  all(): StoreFile[] {
    return [...this.store.values()];
  }

  stream({ filter = () => true }: StreamOptions<StoreFile> = {}): Readable {
    function* iterablefilter(
      iterable: IterableIterator<StoreFile>,
    ): Generator<StoreFile, void, undefined> {
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

    let pipelineTransforms = transforms;
    if (isFileTransform<StoreFile>(options)) {
      pipelineTransforms = [options, ...transforms];
    } else if (options) {
      ({ filter } = options);
      if (options.refresh != null) {
        ({ refresh } = options);
      }

      if (options.resolveConflict != null) {
        ({ resolveConflict } = options);
      } else if (options.allowOverride != null) {
        resolveConflict = (_current, newFile) => newFile;
      }
    }

    const newStore = refresh ? new Map<string, StoreFile>() : undefined;
    const fileFilter =
      filter ?? (pipelineTransforms.length === 0 ? () => false : () => true);

    const addFile = newStore
      ? (file: StoreFile) => {
          const currentFile = newStore.get(file.path);
          let resolvedFile = file;
          if (currentFile) {
            if (!resolveConflict) {
              throw new Error(`Duplicated file ${file.path} was emitted.`);
            }

            resolvedFile = resolveConflict(currentFile, file);
          }

          newStore.set(resolvedFile.path, resolvedFile);
        }
      : undefined;

    function* iterablefilter(
      iterable: IterableIterator<StoreFile>,
    ): Generator<StoreFile, void, undefined> {
      for (const item of iterable) {
        if (fileFilter(item)) {
          yield item;
        } else {
          addFile?.(item);
        }
      }
    }

    const source: AsyncIterable<StoreFile> = Readable.from(
      iterablefilter(this.store.values()),
    );
    const destination: NodeJS.WritableStream = new Transform({
      objectMode: true,
      transform(file: StoreFile, _encoding, callback) {
        addFile?.(file);
        callback(null);
      },
    });
    await pipeline(source, ...pipelineTransforms, destination);

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
