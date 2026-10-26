import type { MemFsEditor } from '../index.ts';
import { type JSONParser } from '../json.ts';

export type ReadJSONOptions = { json?: JSONParser };

export default function readJSON(
  this: MemFsEditor,
  filepath: string,
  defaults?: undefined,
  options?: ReadJSONOptions,
): object | undefined;
export default function readJSON<T>(
  this: MemFsEditor,
  filepath: string,
  defaults: T,
  options?: ReadJSONOptions,
): object | T;
export default function readJSON(
  this: MemFsEditor,
  filepath: string,
  defaults?: unknown,
  options?: ReadJSONOptions,
): unknown {
  if (this.exists(filepath)) {
    const content = this.read(filepath);
    const parse = options?.json?.parse ?? this.json.parse;
    try {
      return parse(content);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not parse JSON in file: ${filepath}. Detail: ${detail}`, {
        cause: error,
      });
    }
  } else {
    return defaults;
  }
}
