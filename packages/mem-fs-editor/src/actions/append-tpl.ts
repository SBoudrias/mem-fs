import ejs from 'ejs';
import type { MemFsEditor } from '../index.ts';

type AppendTplOptions = NonNullable<Parameters<MemFsEditor['append']>[2]> & {
  transformOptions?: ejs.Options;
};

export default function appendTpl(
  this: MemFsEditor,
  ...[to, contents, data, options]: [
    to: string,
    contents: string | Buffer,
    data?: ejs.Data,
    options?: AppendTplOptions,
  ]
) {
  if (options?.transformOptions?.async) {
    throw new Error('Async EJS rendering is not supported');
  }

  this.append(
    to,
    ejs.render(contents.toString(), data, { ...options?.transformOptions, async: false }),
    options,
  );
}
