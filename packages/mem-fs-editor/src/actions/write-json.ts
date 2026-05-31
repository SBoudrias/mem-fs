import type { MemFsEditor } from '../index.ts';

const DEFAULT_INDENTATION = 2;

type JSONReplacer =
  | ((this: unknown, key: string, value: unknown) => unknown)
  | (number | string)[]
  | null;

export default function writeJSON(
  this: MemFsEditor,
  ...[filepath, contents, replacer, space]: [
    filepath: string,
    contents: unknown,
    replacer?: JSONReplacer,
    space?: string | number,
  ]
) {
  const indentation = space ?? DEFAULT_INDENTATION;
  const json =
    typeof replacer === 'function'
      ? JSON.stringify(contents, replacer, indentation)
      : JSON.stringify(contents, replacer, indentation);

  return this.write(filepath, json + '\n');
}
