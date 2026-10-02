/**
 * Cross-version smoke suite for mem-fs-editor.
 *
 * Runs against the pinned mem-fs-editor version from the compat matrix,
 * backed by the head mem-fs tarball. Only exercises APIs available in every
 * supported editor version (11.x, 12.x) so a single suite covers the whole
 * matrix.
 */
import fs from 'node:fs';
import os, { EOL } from 'node:os';
import path from 'node:path';
import {
  create as createEditor,
  type MemFsEditor,
  type MemFsEditorFile,
} from 'mem-fs-editor';
import { create as createStore, type Store } from 'mem-fs';
import { beforeEach, describe, expect, it } from 'vitest';

describe('mem-fs-editor compat', () => {
  let workdir: string;
  let store: Store<MemFsEditorFile>;
  let editor: MemFsEditor<MemFsEditorFile>;

  beforeEach(() => {
    workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-fs-compat-'));
    store = createStore<MemFsEditorFile>();
    editor = createEditor(store);
  });

  describe('read', () => {
    it('reads files from disk through the store', () => {
      const file = path.join(workdir, 'a.txt');
      fs.writeFileSync(file, 'on disk');

      expect(editor.read(file)).toBe('on disk');
    });

    it('prefers in-memory contents over disk', () => {
      const file = path.join(workdir, 'a.txt');
      fs.writeFileSync(file, 'old');

      editor.write(file, 'new');
      expect(editor.read(file)).toBe('new');
    });

    it('reads JSON from disk and extends it in memory', () => {
      const file = path.join(workdir, 'a.json');
      fs.writeFileSync(file, '{"a":1}');

      expect(editor.readJSON(file)).toEqual({ a: 1 });
      editor.extendJSON(file, { b: 2 });
      expect(editor.readJSON(file)).toEqual({ a: 1, b: 2 });
    });
  });

  describe('write', () => {
    it('stays in memory until commit', async () => {
      const file = path.join(workdir, 'a.txt');

      editor.write(file, 'content');
      expect(fs.existsSync(file)).toBe(false);

      await editor.commit();
      expect(fs.readFileSync(file, 'utf8')).toBe('content');
    });

    it('appends contents', async () => {
      const file = path.join(workdir, 'a.txt');

      editor.write(file, 'hello');
      editor.append(file, 'world');
      await editor.commit();

      expect(fs.readFileSync(file, 'utf8')).toBe(`hello${EOL}world`);
    });

    it('extends JSON contents', async () => {
      const file = path.join(workdir, 'a.json');

      editor.writeJSON(file, { a: 1 });
      editor.extendJSON(file, { b: 2 });
      await editor.commit();

      expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ a: 1, b: 2 });
    });
  });

  describe('templates', () => {
    it('renders appendTpl with context', async () => {
      const file = path.join(workdir, 'a.txt');

      editor.write(file, 'hello');
      editor.appendTpl(file, '<%= name %>', { name: 'world' });
      await editor.commit();

      expect(fs.readFileSync(file, 'utf8')).toBe(`hello${EOL}world`);
    });

    it('renders copyTpl with context', async () => {
      const from = path.join(workdir, 'tpl.txt');
      const to = path.join(workdir, 'out.txt');
      fs.writeFileSync(from, '<%= name %>-file');

      editor.copyTpl(from, to, { name: 'copied' });
      await editor.commit();

      expect(fs.readFileSync(to, 'utf8')).toBe('copied-file');
    });
  });

  describe('copy & move', () => {
    it('copies files from disk into memory and commits them', async () => {
      const from = path.join(workdir, 'src.txt');
      const to = path.join(workdir, 'dest.txt');
      fs.writeFileSync(from, 'copied');

      editor.copy(from, to);
      await editor.commit();

      expect(fs.readFileSync(to, 'utf8')).toBe('copied');
    });

    it('moves in-memory files', async () => {
      const from = path.join(workdir, 'a.txt');
      const to = path.join(workdir, 'b.txt');

      editor.write(from, 'moved');
      editor.move(from, to);
      await editor.commit();

      expect(fs.existsSync(from)).toBe(false);
      expect(fs.readFileSync(to, 'utf8')).toBe('moved');
    });
  });

  describe('delete', () => {
    it('removes existing files from disk on commit', async () => {
      const file = path.join(workdir, 'a.txt');
      fs.writeFileSync(file, 'delete me');

      editor.delete(file);
      await editor.commit();

      expect(fs.existsSync(file)).toBe(false);
    });

    it('drops in-memory-only files on commit', async () => {
      const file = path.join(workdir, 'a.txt');

      editor.write(file, 'never written');
      editor.delete(file);
      await editor.commit();

      expect(fs.existsSync(file)).toBe(false);
    });
  });

  describe('store integration', () => {
    it('emits change events for writes and commits', async () => {
      const file = path.join(workdir, 'a.txt');
      const events: string[] = [];
      store.on('change', (filepath: string) => {
        events.push(filepath);
      });

      editor.write(file, 'content');
      await editor.commit();

      expect(events).toContain(file);
    });

    it('dumps every file in the store', () => {
      editor.write(path.join(workdir, 'a.txt'), '1');
      editor.write(path.join(workdir, 'b.txt'), '2');

      const dumped = editor.dump(workdir);
      expect(Object.keys(dumped).toSorted()).toEqual(['a.txt', 'b.txt']);
    });

    it('survives multiple commits', async () => {
      const file = path.join(workdir, 'a.txt');

      editor.write(file, 'content');
      await editor.commit();
      await editor.commit();

      expect(fs.readFileSync(file, 'utf8')).toBe('content');
    });
  });
});
