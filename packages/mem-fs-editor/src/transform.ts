import { Transform } from 'stream';
import commitFileAsync from './actions/commit-file-async.ts';
import type { MemFsEditorFile } from './index.ts';

export const createCommitTransform = () =>
  new Transform({
    objectMode: true,
    transform(file: MemFsEditorFile, _encoding, callback) {
      commitFileAsync(file)
        .then(() => {
          callback(null, file);
        })
        .catch(callback);
    },
  });
