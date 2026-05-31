import ejs from 'ejs';
import type { MemFsEditor } from '../index.ts';
import { isBinary } from '../util.ts';

type CopyTplOptions = Omit<
  NonNullable<Parameters<MemFsEditor['copy']>[2]>,
  'fileTransform' | 'transformData'
> & {
  transformOptions?: ejs.Options;
};

type CopyTplParameters = [
  from: string | string[],
  to: string,
  data?: ejs.Data,
  options?: CopyTplOptions,
  compatOptions?: Omit<
    NonNullable<Parameters<MemFsEditor['copy']>[2]>,
    'fileTransform' | 'transformData'
  >,
];

export function copyTpl(
  this: MemFsEditor,
  ...[from, to, data = {}, options, compatOptions]: CopyTplParameters
): void {
  /* v8 ignore next -- @preserve */
  if (compatOptions) {
    // Backward compatibility.
    options = {
      ...compatOptions,
      transformOptions: options as ejs.Options,
    };
  }

  this.copy(from, to, {
    ...options,
    transformData: data,
    fileTransform({ destinationPath, sourcePath, contents, data, options }) {
      if (options?.async) {
        throw new Error('Async EJS rendering is not supported');
      }

      const renderedPath = ejs.render(destinationPath, data, {
        ...options,
        cache: false, // Cache uses filename as key, which is not provided in this case.
        async: false,
      });
      const processedContent = isBinary(sourcePath, contents)
        ? contents
        : ejs.render(contents.toString(), data, {
            // Setting filename by default allow including partials.
            filename: sourcePath,
            ...options,
            async: false,
          });
      // If the destination path ends with .ejs, the output is expected to be an .ejs file.
      const processedPath = to.endsWith('.ejs')
        ? renderedPath
        : renderedPath.replace(/.ejs$/v, '');

      return { path: processedPath, contents: processedContent };
    },
  });
}
