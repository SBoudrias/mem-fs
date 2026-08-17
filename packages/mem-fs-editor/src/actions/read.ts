import type { MemFsEditor } from '../index.ts';

function read(this: MemFsEditor, filepath: string, options?: never): string;
function read<const DefaultType extends string | null>(
  this: MemFsEditor,
  filepath: string,
  options: { raw?: false; defaults: DefaultType },
): string | DefaultType;
function read(
  this: MemFsEditor,
  filepath: string,
  options: { raw: true; defaults?: never },
): Buffer;
function read<const DefaultType extends Buffer | null>(
  this: MemFsEditor,
  filepath: string,
  options: { raw: true; defaults: DefaultType },
): Buffer | DefaultType;
function read(
  this: MemFsEditor,
  filepath: string,
  options?: { raw?: boolean; defaults?: string | Buffer | null },
): Buffer | string | null {
  const resolvedOptions = options ?? { raw: false };
  const file = this.store.get(filepath);

  if (file.contents === null) {
    if ('defaults' in resolvedOptions) {
      return resolvedOptions.defaults ?? null;
    }

    throw new Error(`${filepath} doesn't exist`);
  }

  const raw = resolvedOptions.raw ?? false;
  return raw ? file.contents : file.contents.toString();
}

export default read;
