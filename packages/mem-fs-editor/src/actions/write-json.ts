import type { MemFsEditor } from '../index.ts';
import type { WriteOptions } from './write.ts';
import {
  type JSONParser,
  type JSONReplacer,
  getFileText,
  resolveJSONParser,
} from '../json.ts';

const DEFAULT_INDENTATION = 2;

export default function writeJSON(
  this: MemFsEditor,
  ...[filepath, contents, replacer, space, options, parser]: [
    filepath: string,
    contents: unknown,
    replacer?: JSONReplacer,
    space?: string | number,
    options?: WriteOptions,
    parser?: JSONParser,
  ]
): string {
  const indentation = space ?? DEFAULT_INDENTATION;
  const { stringify } = resolveJSONParser(parser, this.jsonParser);

  if (stringify !== undefined) {
    // A custom serializer is patch-aware: it owns the full document text
    // (including the trailing newline), so its output is written as-is.
    return this.write(
      filepath,
      stringify(getFileText(this.store, filepath), contents),
      options,
    );
  }

  const json =
    typeof replacer === 'function'
      ? JSON.stringify(contents, replacer, indentation)
      : JSON.stringify(contents, replacer, indentation);

  return this.write(filepath, `${json}\n`, options);
}
