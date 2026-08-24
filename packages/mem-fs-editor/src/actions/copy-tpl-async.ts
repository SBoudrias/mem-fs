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

export default async function copyTplAsync(
  this: MemFsEditor,
  ...[from, to, data = {}, options, compatOptions]: CopyTplAsyncParameters
): Promise<void> {
  /* v8 ignore next -- @preserve */
  if (compatOptions) {
    // Backward compatibility: in compat mode `options` carries the EJS
    // options at runtime despite its declared type.
    options = {
      ...compatOptions,
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      transformOptions: options as ejs.Options,
    };
  }

  await this.copyAsync(from, to, {
    ...options,
    transformData: data,
    async fileTransform({
      destinationPath,
      sourcePath,
      contents,
      data: templateData,
      options: templateOptions,
    }) {
      const renderedPath = await ejs.render(destinationPath, templateData, {
        ...templateOptions,
        cache: false, // Cache uses filename as key, which is not provided in this case.
      });
      const processedContent = isBinary(sourcePath, contents)
        ? contents
        : await ejs.render(contents.toString(), templateData, {
            // Setting filename by default allow including partials.
            filename: sourcePath,
            // Async option cannot be set to true because `include()` then also become async which change the behaviors of templates.
            // Users must pass async value in transformOptions if they want to use async features of ejs.
            ...templateOptions,
          });
      // If the destination path ends with .ejs, the output is expected to be an .ejs file.
      const processedPath = to.endsWith('.ejs')
        ? renderedPath
        : renderedPath.replace(/.ejs$/v, '');

      return { path: processedPath, contents: processedContent };
    },
  });
}
