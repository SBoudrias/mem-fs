import { isFileTransform, type FileTransform, type PipelineOptions } from 'mem-fs';
import type { MemFsEditor, MemFsEditorFile } from '../index.ts';

import { createCommitTransform } from '../transform.ts';
import { isFilePending } from '../state.ts';

async function commit<EditorFile extends MemFsEditorFile>(
  this: MemFsEditor<EditorFile>,
  options?: PipelineOptions<EditorFile> | FileTransform<EditorFile>,
  ...transforms: FileTransform<EditorFile>[]
): Promise<void> {
  let pipelineOptions: PipelineOptions<EditorFile> | undefined;
  let pipelineTransforms = transforms;
  if (isFileTransform<EditorFile>(options)) {
    pipelineTransforms = [options, ...transforms];
  } else {
    pipelineOptions = options;
  }

  await this.store.pipeline(
    { filter: isFilePending, ...pipelineOptions },
    ...pipelineTransforms,
    createCommitTransform(),
  );
}

export default commit;
