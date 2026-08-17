import { Transform } from 'node:stream';
import commitFileAsync from './actions/commit-file-async.ts';
import type { MemFsEditorFile } from './index.ts';

export const createCommitTransform = (): Transform =>
  new Transform({
    objectMode: true,
    // Node Transform streams are callback-based by design. The callback calls
    // terminate each branch, which callback-return/no-useless-return cannot express.
    // oxlint-disable promise/prefer-await-to-callbacks, promise/no-callback-in-promise, node/callback-return
    async transform(file: MemFsEditorFile, _encoding, callback): Promise<void> {
      try {
        await commitFileAsync(file);
        callback(null, file);
      } catch (error) {
        /* v8 ignore next -- defensive: commitFileAsync only rejects with Error */
        callback(error instanceof Error ? error : new Error(String(error)));
      }
    },
    // oxlint-enable promise/prefer-await-to-callbacks, promise/no-callback-in-promise, node/callback-return
  });
