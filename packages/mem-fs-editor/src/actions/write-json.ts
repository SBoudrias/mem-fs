import type { MemFsEditor } from '../index.ts';
import {
  getFileText,
  resolveJSONParser,
  tryParseOriginal,
  type JSONParser,
  type JSONReplacer,
} from '../json.ts';
import type { WriteOptions } from './write.ts';

const DEFAULT_INDENTATION = 2;

export type WriteJSONOptions = WriteOptions & { json?: JSONParser };

export default function writeJSON(
  this: MemFsEditor,
  ...[filepath, contents, replacer, space, options]: [
    filepath: string,
    contents: unknown,
    replacer?: JSONReplacer,
    space?: string | number,
    options?: WriteJSONOptions,
  ]
): string {
  const indentation = space ?? DEFAULT_INDENTATION;
  const { parse, stringify } = resolveJSONParser(options?.json, this.json);

  if (stringify !== undefined) {
    // A custom serializer is patch-aware: it owns the full document text
    // (including the trailing newline), so its output is written as-is.
    const originalText = getFileText(this.store, filepath);
    return this.write(
      filepath,
      stringify(contents, {
        filepath,
        originalText,
        original: tryParseOriginal(parse, originalText),
        replacer,
        space,
      }),
      options,
    );
  }

  const json =
    typeof replacer === 'function'
      ? JSON.stringify(contents, replacer, indentation)
      : JSON.stringify(contents, replacer, indentation);

  return this.write(filepath, `${json}\n`, options);
}
