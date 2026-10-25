import extend from 'deep-extend';
import type { MemFsEditor } from '../index.ts';
import type { WriteOptions } from './write.ts';
import { type JSONParser, type JSONReplacer } from '../json.ts';

export default function extendJSON(
  this: MemFsEditor,
  ...[filepath, contents, replacer, space, options, parser]: [
    filepath: string,
    contents: Record<string, unknown>,
    replacer?: JSONReplacer,
    space?: string | number,
    options?: WriteOptions,
    parser?: JSONParser,
  ]
): void {
  const originalContent = this.readJSON(filepath, {}, parser);
  const newContent = extend({}, originalContent, contents);

  this.writeJSON(filepath, newContent, replacer, space, options, parser);
}
