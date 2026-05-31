import { isFileTransform, type FileTransform, type PipelineOptions } from 'mem-fs';
import type { MemFsEditor, MemFsEditorFile } from '../index.ts';

import { createCommitTransform } from '../transform.ts';
import { isFilePending } from '../state.ts';

async function commit<EditorFile extends MemFsEditorFile>(
  this: MemFsEditor<EditorFile>,
  options?: PipelineOptions<EditorFile> | FileTransform<EditorFile>,
  ...transforms: FileTransform<EditorFile>[]
): Promise<void> {
  if (isFileTransform<EditorFile>(options)) {
    transforms = [options, ...transforms];
    options = undefined;
  }

  await this.store.pipeline(
    { filter: isFilePending, ...options },
    ...transforms,
    createCommitTransform(),
  );
}

export default commit;
