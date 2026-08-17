import type { Store } from 'mem-fs';
import type Vinyl from 'vinyl';
import read from './actions/read.ts';
import readJSON from './actions/read-json.ts';
import exists from './actions/exists.ts';
import write from './actions/write.ts';
import writeJSON from './actions/write-json.ts';
import extendJSON from './actions/extend-json.ts';
import append from './actions/append.ts';
import appendTpl from './actions/append-tpl.ts';
import deleteAction from './actions/delete.ts';
import { copy } from './actions/copy.ts';
import { copyTpl } from './actions/copy-tpl.ts';
import { copyAsync } from './actions/copy-async.ts';
import copyTplAsync from './actions/copy-tpl-async.ts';
import move from './actions/move.ts';
import commit from './actions/commit.ts';
import dump from './actions/dump.ts';

export type { PipelineOptions, FileTransform } from 'mem-fs';

export interface MemFsEditorFile {
  path: string;
  stat?: { mode?: number } | null;
  contents: Buffer | null;

  committed?: boolean;
  isNew?: boolean;
  state?: 'modified' | 'deleted';
  stateCleared?: 'modified' | 'deleted';
}

// We don't support StreamFile and stat is not guaranteed to be a fs.Stat instance
export interface VinylMemFsEditorFile
  extends Omit<Vinyl, 'contents' | 'stat'>, MemFsEditorFile {}

// oxlint-disable-next-line typescript/no-unsafe-declaration-merging
export class MemFsEditor<EditorFile extends MemFsEditorFile = VinylMemFsEditorFile> {
  public store: Store<EditorFile>;

  public constructor(store: Store<EditorFile>) {
    this.store = store;
  }
}

export interface MemFsEditor<EditorFile extends MemFsEditorFile = VinylMemFsEditorFile> {
  read: typeof read;
  readJSON: typeof readJSON;
  exists: typeof exists;
  write: typeof write;
  writeJSON: typeof writeJSON;
  extendJSON: typeof extendJSON;
  append: typeof append;
  appendTpl: typeof appendTpl;
  delete: typeof deleteAction;
  copy: typeof copy;
  copyTpl: typeof copyTpl;
  copyAsync: typeof copyAsync;
  copyTplAsync: typeof copyTplAsync;
  move: typeof move;
  commit: typeof commit<EditorFile>;
  dump: typeof dump<EditorFile>;
}

MemFsEditor.prototype.read = read;
MemFsEditor.prototype.readJSON = readJSON;
MemFsEditor.prototype.exists = exists;
MemFsEditor.prototype.write = write;
MemFsEditor.prototype.writeJSON = writeJSON;
MemFsEditor.prototype.extendJSON = extendJSON;
MemFsEditor.prototype.append = append;
MemFsEditor.prototype.appendTpl = appendTpl;
MemFsEditor.prototype.delete = deleteAction;
MemFsEditor.prototype.copy = copy;
MemFsEditor.prototype.copyTpl = copyTpl;
MemFsEditor.prototype.copyAsync = copyAsync;
MemFsEditor.prototype.copyTplAsync = copyTplAsync;
MemFsEditor.prototype.move = move;
MemFsEditor.prototype.commit = commit;
MemFsEditor.prototype.dump = dump;

export function create<T extends MemFsEditorFile>(store: Store<T>): MemFsEditor<T> {
  return new MemFsEditor<T>(store);
}
