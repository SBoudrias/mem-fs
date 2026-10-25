import type { MemFsEditor } from '../index.ts';
import type { JSONParser } from '../json.ts';

export default function readJSON(
  this: MemFsEditor,
  filepath: string,
  defaults?: undefined,
  parser?: JSONParser,
): object | undefined;
export default function readJSON<T>(
  this: MemFsEditor,
  filepath: string,
  defaults: T,
  parser?: JSONParser,
): object | T;
export default function readJSON(
  this: MemFsEditor,
  filepath: string,
  defaults?: unknown,
  parser?: JSONParser,
): unknown {
  if (this.exists(filepath)) {
    try {
      const content = this.read(filepath);
      const parse = parser?.parse ?? this.jsonParser.parse;
      const parsed: unknown = parse(content);
      return parsed;
    } catch (error) {
      /* v8 ignore next -- defensive: JSON.parse only throws SyntaxError */
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not parse JSON in file: ${filepath}. Detail: ${detail}`, {
        cause: error,
      });
    }
  } else {
    return defaults;
  }
}
