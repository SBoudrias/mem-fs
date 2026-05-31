import { isBinary } from '../util.ts';
import type { MemFsEditor } from '../index.ts';
import ejs from 'ejs';

type CopyTplAsyncOptions = Omit<
  NonNullable<Parameters<MemFsEditor['copyAsync']>[2]>,
  'fileTransform' | 'transformData'
> & {
  transformOptions?: ejs.Options;
};

type CopyTplAsyncParameters = [
  from: string | string[],
  to: string,
  data?: ejs.Data,
  options?: CopyTplAsyncOptions,
  compatOptions?: Omit<
    NonNullable<Parameters<MemFsEditor['copyAsync']>[2]>,
    'fileTransform' | 'transformData'
  >,
];

export default async function (
  this: MemFsEditor,
  ...[from, to, data = {}, options, compatOptions]: CopyTplAsyncParameters
): Promise<void> {
  /* v8 ignore next -- @preserve */
  if (compatOptions) {
    // Backward compatibility.
    options = {
      ...compatOptions,
      transformOptions: options as ejs.Options,
    };
  }

  await this.copyAsync(from, to, {
    ...options,
    transformData: data,
    async fileTransform({ destinationPath, sourcePath, contents, data, options }) {
      const renderedPath = await ejs.render(destinationPath, data, {
        ...options,
        cache: false, // Cache uses filename as key, which is not provided in this case.
      });
      const processedContent = isBinary(sourcePath, contents)
        ? contents
        : await ejs.render(contents.toString(), data, {
            // Setting filename by default allow including partials.
            filename: sourcePath,
            // Async option cannot be set to true because `include()` then also become async which change the behaviors of templates.
            // Users must pass async value in transformOptions if they want to use async features of ejs.
            ...options,
          });
      // If the destination path ends with .ejs, the output is expected to be an .ejs file.
      const processedPath = to.endsWith('.ejs')
        ? renderedPath
        : renderedPath.replace(/.ejs$/v, '');

      return { path: processedPath, contents: processedContent };
    },
  });
}
