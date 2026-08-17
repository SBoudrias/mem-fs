import type { MemFsEditor } from '../index.ts';

export default function move(
  this: MemFsEditor,
  from: string,
  to: string,
  options?: Parameters<MemFsEditor['copy']>[2],
): void {
  this.copy(from, to, options);
  this.delete(from, options);
}
