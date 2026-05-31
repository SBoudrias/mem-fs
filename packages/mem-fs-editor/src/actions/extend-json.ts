import extend from 'deep-extend';
import type { MemFsEditor } from '../index.ts';

type JSONReplacer =
  | ((this: unknown, key: string, value: unknown) => unknown)
  | (number | string)[]
  | null;

export default function extendJSON(
  this: MemFsEditor,
  ...[filepath, contents, replacer, space]: [
    filepath: string,
    contents: Record<string, unknown>,
    replacer?: JSONReplacer,
    space?: string | number,
  ]
) {
  const originalContent = this.readJSON(filepath, {});
  const newContent = extend({}, originalContent, contents);

  this.writeJSON(filepath, newContent, replacer, space);
}
