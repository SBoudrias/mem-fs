import type { Store } from 'mem-fs';
import type { MemFsEditorFile } from './index.ts';

export type JSONReplacer =
  | ((this: unknown, key: string, value: unknown) => unknown)
  | (number | string)[]
  | null;

/**
 * Parse a JSON (or JSON-like, e.g. JSONC) document into a value.
 */
export type JSONParse = (text: string) => unknown;

/**
 * Serialize `value` to document text.
 *
 * `originalText` is the current text of the target file (in-memory pending
 * changes included), or `undefined` when the file does not exist. This makes
 * the hook patch-aware: an implementation can rewrite only what changed in the
 * original document, keeping comments, key order and formatting intact, instead
 * of re-serializing `value`.
 */
export type JSONStringify = (originalText: string | undefined, value: unknown) => string;

/**
 * User-provided JSON handling, overriding the default `JSON.parse` /
 * `JSON.stringify` implementation.
 */
export type JSONParser = {
  parse?: JSONParse;
  stringify?: JSONStringify;
};

/**
 * Editor-level options accepted by `create(store, options)` and the
 * `MemFsEditor` constructor.
 */
export type MemFsEditorOptions = {
  /**
   * JSON handling used by the JSON helpers (`readJSON`, `writeJSON`,
   * `extendJSON`).
   */
  json?: JSONParser;
};

export type ResolvedJSONParser = {
  parse: JSONParse;
  stringify: JSONStringify | undefined;
};

export const DEFAULT_JSON_PARSER: ResolvedJSONParser = {
  parse: JSON.parse,
  stringify: undefined,
};

/**
 * Resolve a per-call parser over the editor-level one: per-call hooks take
 * precedence, editor-level hooks fill the gaps, defaults apply last.
 */
export function resolveJSONParser(
  perCall: JSONParser | undefined,
  editorParser: ResolvedJSONParser,
): ResolvedJSONParser {
  if (perCall === undefined) {
    return editorParser;
  }

  return {
    parse: perCall.parse ?? editorParser.parse,
    stringify: perCall.stringify ?? editorParser.stringify,
  };
}

/**
 * Current text of a file (pending in-memory changes included), or `undefined`
 * when the file does not exist.
 */
export function getFileText<EditorFile extends MemFsEditorFile>(
  store: Store<EditorFile>,
  filepath: string,
): string | undefined {
  const file = store.get(filepath);

  return file.contents === null ? undefined : file.contents.toString();
}
