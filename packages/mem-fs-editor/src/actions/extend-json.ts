import createDebug from 'debug';
import extend from 'deep-extend';
import type { MemFsEditor } from '../index.ts';
import { DEFAULT_JSON_PARSER, type JSONReplacer } from '../json.ts';
import type { WriteJSONOptions } from './write-json.ts';

const debug = createDebug('mem-fs-editor:extend-json');

export default function extendJSON(
  this: MemFsEditor,
  ...[filepath, contents, replacer, space, options]: [
    filepath: string,
    contents: Record<string, unknown>,
    replacer?: JSONReplacer,
    space?: string | number,
    options?: WriteJSONOptions,
  ]
): void {
  if (
    this.json.stringify === undefined &&
    (options?.json?.parse ?? this.json.parse) !== DEFAULT_JSON_PARSER.parse
  ) {
    debug(
      'A custom parse hook is configured without a stringify hook: %s will be re-serialized with JSON.stringify, dropping comments and formatting',
      filepath,
    );
  }

  const originalContent = this.readJSON(filepath, {}, options);
  const newContent = extend({}, originalContent, contents);

  this.writeJSON(filepath, newContent, replacer, space, options);
}
