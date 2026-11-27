import type { Store } from 'mem-fs';
import type { MemFsEditorFile } from './index.ts';

export type JSONReplacer =
  | ((this: unknown, key: string, value: unknown) => unknown)
  | (number | string)[]
  | null;

/**
 * Parse a JSON (or JSON-like, e.g. JSONC) document into a value.
 *
 * Must throw on input it cannot parse: the JSON helpers report the failure
 * instead of silently continuing with a partial value. Note that some parsers
 * (e.g. jsonc-parser's `parse`) never throw on their own and need a wrapper
 * that checks their error output and throws.
 */
export type JSONParse = (text: string) => unknown;

/**
 * Context handed to a custom JSON serializer.
 */
export type JSONStringifyContext = {
  /** Path of the file being written. */
  filepath: string;
  /**
   * Current text of the target file, pending in-memory changes included.
   * `''` when the file exists but is empty, `undefined` when it does not exist.
   * The text is passed through as-is: a leading BOM, if any, is included.
   */
  originalText: string | undefined;
  /**
   * `originalText` parsed with the configured `parse` hook — the value the
   * editor already had in hand, so the serializer doesn't need to re-parse.
   * `undefined` when there is no original text or it failed to parse.
   */
  original: unknown;
  /** The `replacer` argument of `writeJSON()`/`extendJSON()`, if provided. */
  replacer: JSONReplacer | undefined;
  /** The `space` argument of `writeJSON()`/`extendJSON()`, if provided. */
  space: string | number | undefined;
};

/**
 * Serialize `value` to document text. The value comes first, matching
 * `JSON.stringify`; the context object can grow new fields without a breaking
 * change.
 *
 * This makes the hook patch-aware: when `context.originalText` is available, an
 * implementation can rewrite only what changed in the original document,
 * keeping comments, key order and formatting intact, instead of
 * re-serializing `value`.
 */
export type JSONStringify = (value: unknown, context: JSONStringifyContext) => string;

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
 * Parse an original document for a serializer context, without letting a
 * parse failure abort the write: the serializer still gets `originalText` and
 * can decide what to do with it.
 */
export function tryParseOriginal(
  parse: JSONParse,
  originalText: string | undefined,
): unknown {
  if (originalText === undefined) {
    return undefined;
  }

  try {
    return parse(originalText);
  } catch {
    return undefined;
  }
}

/**
 * Current text of a file (pending in-memory changes included), or `undefined`
 * when the file does not exist (never created, or deleted).
 */
export function getFileText<EditorFile extends MemFsEditorFile>(
  store: Store<EditorFile>,
  filepath: string,
): string | undefined {
  const file = store.get(filepath);

  return file.contents === null ? undefined : file.contents.toString();
}
