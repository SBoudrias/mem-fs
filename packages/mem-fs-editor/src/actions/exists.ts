import type { MemFsEditor } from '../index.ts';

export default function exist(this: MemFsEditor, filepath: string): boolean {
  const file = this.store.get(filepath);

  return file.contents !== null;
}
