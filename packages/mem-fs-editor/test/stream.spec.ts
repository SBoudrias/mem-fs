import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create as createMemFs } from 'mem-fs';
import { create, type MemFsEditorFile } from '../src/index.ts';
import { getFixture } from './fixtures.ts';

function diffLines(a: string, b: string): string[] {
  const aLines = a.split('\n');
  const bLines = b.split('\n');
  const result: string[] = [];
  for (let i = 0; i < Math.max(aLines.length, bLines.length); i += 1) {
    if (aLines[i] !== bLines[i]) {
      if (aLines[i] !== undefined) {
        result.push(`- ${aLines[i]}`);
      }

      if (bLines[i] !== undefined) {
        result.push(`+ ${bLines[i]}`);
      }
    }
  }

  return result;
}

describe('#stream()', () => {
  let output: string;

  beforeEach(() => {
    output = path.join(os.tmpdir(), `mem-fs-editor-stream-${String(Math.random())}`);
    fs.mkdirSync(output, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(output, { recursive: true, force: true });
  });

  it('yields pending writes with state added/modified and pending contents', async () => {
    const memFs = create(createMemFs<MemFsEditorFile>());

    fs.writeFileSync(path.join(output, 'existing.txt'), 'original on disk');
    memFs.write(path.join(output, 'existing.txt'), 'updated');
    memFs.write(path.join(output, 'new-file.txt'), 'brand new');

    const streamed = [];
    for await (const file of memFs.stream()) {
      streamed.push(file);
    }

    expect(streamed.map((file) => [path.basename(file.path), file.state])).toEqual([
      ['existing.txt', 'modified'],
      ['new-file.txt', 'added'],
    ]);
    expect(streamed[0]?.contents?.toString()).toBe('updated');
    expect(streamed[1]?.contents?.toString()).toBe('brand new');
  });

  it('exposes the original contents without re-reading the disk', async () => {
    const memFs = create(createMemFs<MemFsEditorFile>());

    const file = path.join(output, 'file.txt');
    fs.writeFileSync(file, 'original contents');
    // Load the file in memory before writing, so the editor knows the
    // pre-modification contents without hitting the disk.
    memFs.read(file);
    memFs.write(file, 'modified contents');

    for await (const streamed of memFs.stream()) {
      expect(streamed.originalContents?.toString()).toBe('original contents');
      expect(streamed.contents?.toString()).toBe('modified contents');
    }
  });

  it('keeps the original of the first modification across subsequent writes', async () => {
    const memFs = create(createMemFs<MemFsEditorFile>());

    const file = path.join(output, 'file.txt');
    fs.writeFileSync(file, 'original contents');
    memFs.read(file);
    memFs.write(file, 'modified once');
    memFs.write(file, 'modified twice');

    for await (const streamed of memFs.stream()) {
      expect(streamed.originalContents?.toString()).toBe('original contents');
      expect(streamed.contents?.toString()).toBe('modified twice');
      expect(streamed.changed).toBe(true);
    }
  });

  it('captures a fresh original on a new modification cycle after commit()', async () => {
    const memFs = create(createMemFs<MemFsEditorFile>());

    const file = path.join(output, 'cycle.txt');
    fs.writeFileSync(file, 'first original');
    memFs.read(file);
    memFs.write(file, 'first update');
    await memFs.commit();
    // The disk now holds `first update`.

    memFs.write(file, 'second update');

    for await (const streamed of memFs.stream()) {
      expect(streamed.originalContents?.toString()).toBe('first update');
      expect(streamed.contents?.toString()).toBe('second update');
    }
  });

  it('resolves the original contents of a file written without being loaded first, once', async () => {
    const memFs = create(createMemFs<MemFsEditorFile>());

    const file = path.join(output, 'file.txt');
    fs.writeFileSync(file, 'on disk');

    let reads = 0;
    const { readFileSync } = fs;
    vi.spyOn(fs, 'readFileSync').mockImplementation((...args) => {
      reads += 1;
      return readFileSync(...args);
    });

    memFs.write(file, 'in editor');

    // Writing a file never loaded in the store does not read the disk:
    // commit()-only users pay nothing.
    expect(reads).toBe(0);

    fs.writeFileSync(file, 'changed behind our back');

    for await (const streamed of memFs.stream()) {
      expect(streamed.originalContents?.toString()).toBe('changed behind our back');
    }

    // The original is resolved from the disk once, when streamed.
    expect(reads).toBe(1);

    for await (const streamed of memFs.stream()) {
      expect(streamed.originalContents?.toString()).toBe('changed behind our back');
    }

    // ... and never re-read afterwards.
    expect(reads).toBe(1);

    vi.mocked(fs.readFileSync).mockRestore();
  });

  it('resolves the original when the file was removed from the disk after being written', async () => {
    const memFs = create(createMemFs<MemFsEditorFile>());

    const file = path.join(output, 'vanished.txt');
    fs.writeFileSync(file, 'on disk');
    memFs.write(file, 'in editor');
    // The original is resolved from the disk when streamed, so a file gone
    // by then resolves to a new file.
    fs.rmSync(file);

    for await (const streamed of memFs.stream()) {
      expect(streamed.originalContents).toBeNull();
      expect(streamed.originalStat).toBeNull();
      expect(streamed.state).toBe('added');
      expect(streamed.changed).toBe(true);
    }
  });

  it('reports an unchanged write as not changed', async () => {
    const memFs = create(createMemFs<MemFsEditorFile>());

    const file = path.join(output, 'unchanged.txt');
    fs.writeFileSync(file, 'same contents');
    memFs.read(file);
    // A write with identical contents still marks the file as modified
    // (backwards compatible behavior).
    memFs.write(file, 'same contents');

    for await (const streamed of memFs.stream()) {
      expect(streamed.state).toBe('modified');
      expect(streamed.changed).toBe(false);
    }
  });

  it('reports a modified write as changed', async () => {
    const memFs = create(createMemFs<MemFsEditorFile>());

    const file = path.join(output, 'changed.txt');
    fs.writeFileSync(file, 'old contents');
    memFs.read(file);
    memFs.write(file, 'new contents');

    for await (const streamed of memFs.stream()) {
      expect(streamed.changed).toBe(true);
    }
  });

  it('exposes the pending stat and original stat, and reports mode-only changes', async () => {
    const memFs = create(createMemFs<MemFsEditorFile>());

    const file = path.join(output, 'script.sh');
    fs.writeFileSync(file, 'same contents');
    const originalStat = fs.statSync(file);
    memFs.read(file);

    // Same contents, only the mode changes (making the script executable);
    // only `mode` is read, the rest of the stat is irrelevant here.
    // oxlint-disable-next-line typescript/no-misused-spread
    const executableStat = { ...originalStat, mode: 0o755 };
    memFs.write(file, 'same contents', { stat: executableStat });

    for await (const streamed of memFs.stream()) {
      expect(streamed.contents?.toString()).toBe('same contents');
      expect(streamed.originalContents?.toString()).toBe('same contents');
      expect(streamed.stat?.mode).toBe(0o755);
      expect(streamed.originalStat?.mode).toBe(originalStat.mode);
      expect(streamed.changed).toBe(true);
    }
  });

  it('reports a write staging the on-disk mode as not changed', async () => {
    const memFs = create(createMemFs<MemFsEditorFile>());

    const file = path.join(output, 'same-mode.txt');
    fs.writeFileSync(file, 'same contents');
    memFs.read(file);

    const onDiskStat = fs.statSync(file);
    memFs.write(file, 'same contents', { stat: onDiskStat });

    for await (const streamed of memFs.stream()) {
      expect(streamed.changed).toBe(false);
    }
  });

  it('reports added files as changed', async () => {
    const memFs = create(createMemFs<MemFsEditorFile>());

    memFs.write(path.join(output, 'added.txt'), 'new');

    for await (const streamed of memFs.stream()) {
      expect(streamed.state).toBe('added');
      expect(streamed.originalContents).toBeNull();
      expect(streamed.changed).toBe(true);
    }
  });

  it('yields deletions of files existing on the disk', async () => {
    const memFs = create(createMemFs<MemFsEditorFile>());

    const file = path.join(output, 'deleted.txt');
    fs.writeFileSync(file, 'to delete');
    memFs.delete(file);

    const streamed = [];
    for await (const change of memFs.stream()) {
      streamed.push(change);
      // Consumer removes the file itself.
      fs.rmSync(change.path);
      change.markCommitted();
    }

    expect(streamed).toHaveLength(1);
    expect(streamed[0]).toMatchObject({
      path: file,
      state: 'deleted',
      contents: null,
      changed: true,
    });
    expect(streamed[0]?.originalContents?.toString()).toBe('to delete');

    const storeFile = memFs.store.get(file);
    expect(storeFile.committed).toBe(true);
    expect(storeFile.state).toBeUndefined();
  });

  it('handles deleting a path that was never loaded and does not exist', async () => {
    const memFs = create(createMemFs<MemFsEditorFile>());

    memFs.delete(path.join(output, 'never-existed.txt'));

    const streamed = [];
    for await (const change of memFs.stream()) {
      streamed.push(change);
    }

    // New files deleted before commiting are not pending.
    expect(streamed).toEqual([]);
  });

  it('does not yield files deleted before being written', async () => {
    const memFs = create(createMemFs<MemFsEditorFile>());

    memFs.write('to-delete', 'foo');
    memFs.delete('to-delete');

    const streamed = [];
    for await (const change of memFs.stream()) {
      streamed.push(change);
    }

    expect(streamed).toEqual([]);
  });

  it('does not yield non-pending files', async () => {
    const memFs = create(createMemFs<MemFsEditorFile>());

    // Only reads the file; no pending change.
    memFs.read(getFixture('file-a.txt'));

    const streamed = [];
    for await (const change of memFs.stream()) {
      streamed.push(change);
    }

    expect(streamed).toEqual([]);
  });

  it('accepts a custom filter', async () => {
    const memFs = create(createMemFs<MemFsEditorFile>());

    memFs.write(path.join(output, 'a.txt'), 'a');
    memFs.write(path.join(output, 'b.txt'), 'b');

    const streamed = [];
    for await (const change of memFs.stream({
      filter: (file) => file.path.endsWith('b.txt'),
    })) {
      streamed.push(change);
    }

    expect(streamed.map((change) => path.basename(change.path))).toEqual(['b.txt']);
  });

  it('narrows, never widens: a filter matching non-pending files does not yield them', async () => {
    const memFs = create(createMemFs<MemFsEditorFile>());

    // A file only read is in the store but not pending; a naive filter
    // matching everything must not yield it as an added file.
    fs.writeFileSync(path.join(output, 'read-only.txt'), 'untouched');
    memFs.read(path.join(output, 'read-only.txt'));
    memFs.write(path.join(output, 'pending.txt'), 'pending');

    const streamed = [];
    for await (const change of memFs.stream({ filter: () => true })) {
      streamed.push(change);
    }

    expect(streamed.map((change) => path.basename(change.path))).toEqual(['pending.txt']);
  });

  it('ignores store entries without contents, like directories', async () => {
    const memFs = create(createMemFs<MemFsEditorFile>());

    // Loading a directory path puts a contents-less entry in the store.
    memFs.store.get(output);
    memFs.write(path.join(output, 'a.txt'), 'a');

    const streamed = [];
    for await (const change of memFs.stream({ filter: () => true })) {
      streamed.push(change);
    }

    expect(streamed.map((change) => path.basename(change.path))).toEqual(['a.txt']);
  });

  it('does not modify the pending state; commit() still persists afterwards', async () => {
    const memFs = create(createMemFs<MemFsEditorFile>());

    const file = path.join(output, 'committed-after-stream.txt');
    fs.writeFileSync(file, 'original');
    memFs.write(file, 'updated');

    const streamed = [];
    for await (const change of memFs.stream()) {
      streamed.push(change);
    }

    expect(streamed).toHaveLength(1);
    expect(memFs.store.get(file).state).toBe('modified');

    await memFs.commit();
    expect(fs.readFileSync(file, 'utf8')).toBe('updated');
  });

  it('iterates a snapshot: files written during the loop are not yielded', async () => {
    const memFs = create(createMemFs<MemFsEditorFile>());

    memFs.write(path.join(output, 'first.txt'), 'first');

    const streamed = [];
    for await (const change of memFs.stream()) {
      streamed.push(change);
      memFs.write(
        path.join(output, `written-during-${String(streamed.length)}.txt`),
        'late',
      );
    }

    expect(streamed.map((change) => path.basename(change.path))).toEqual(['first.txt']);

    // The late writes are pending for the next iteration, alongside the
    // first file (streaming does not reset the pending state).
    const next = [];
    for await (const change of memFs.stream()) {
      next.push(change);
    }
    expect(next.map((change) => path.basename(change.path))).toEqual([
      'first.txt',
      'written-during-1.txt',
    ]);
  });

  it('streams a copy from a pending source with its own original', async () => {
    const memFs = create(createMemFs<MemFsEditorFile>());

    const source = path.join(output, 'source.txt');
    const destination = path.join(output, 'destination.txt');
    fs.writeFileSync(source, 'source original');
    memFs.write(source, 'pending contents');

    // Copying a pending source stages a pending destination; the copy must
    // not inherit the source's captured original.
    memFs.copy(source, destination);

    const streamed = [];
    for await (const change of memFs.stream()) {
      streamed.push(change);
    }

    const destinationChange = streamed.find((change) => change.path === destination);
    expect(destinationChange?.state).toBe('added');
    expect(destinationChange?.originalContents).toBeNull();
    expect(destinationChange?.contents?.toString()).toBe('pending contents');
  });

  it('streams a move as a deletion and an addition', async () => {
    const memFs = create(createMemFs<MemFsEditorFile>());

    const from = path.join(output, 'from.txt');
    const to = path.join(output, 'to.txt');
    fs.writeFileSync(from, 'moved contents');
    memFs.move(from, to);

    const streamed = [];
    for await (const change of memFs.stream()) {
      streamed.push(change);
    }

    expect(
      Object.fromEntries(streamed.map((change) => [change.path, change.state])),
    ).toEqual({
      [from]: 'deleted',
      [to]: 'added',
    });
  });

  it('streams an append with the pre-append original', async () => {
    const memFs = create(createMemFs<MemFsEditorFile>());

    const file = path.join(output, 'appended.txt');
    fs.writeFileSync(file, 'base');
    memFs.read(file);
    memFs.append(file, 'appended', { separator: '' });

    for await (const change of memFs.stream()) {
      expect(change.contents?.toString()).toBe('baseappended');
      expect(change.originalContents?.toString()).toBe('base');
      expect(change.changed).toBe(true);
    }
  });

  it('streams binary contents as a Buffer', async () => {
    const memFs = create(createMemFs<MemFsEditorFile>());

    const contents = Buffer.from([0, 1, 2, 255]);
    memFs.write(path.join(output, 'file.bin'), contents);

    for await (const change of memFs.stream()) {
      expect(change.contents).toEqual(contents);
      expect(change.state).toBe('added');
    }
  });

  it('streams a write over an empty file', async () => {
    const memFs = create(createMemFs<MemFsEditorFile>());

    const file = path.join(output, 'empty.txt');
    fs.writeFileSync(file, '');
    memFs.write(file, 'filled');

    for await (const change of memFs.stream()) {
      expect(change.originalContents).toEqual(Buffer.from(''));
      expect(change.contents?.toString()).toBe('filled');
      expect(change.changed).toBe(true);
    }
  });

  it('reports an unchanged write-first file as not changed', async () => {
    const memFs = create(createMemFs<MemFsEditorFile>());

    const file = path.join(output, 'same-contents.txt');
    fs.writeFileSync(file, 'same contents');
    // Written without being loaded: the original is resolved from the disk
    // when streamed, staging no stat.
    memFs.write(file, 'same contents');

    for await (const streamed of memFs.stream()) {
      expect(streamed.state).toBe('modified');
      expect(streamed.changed).toBe(false);
      // The write staged no stat (vinyl defaults it to null).
      expect(streamed.stat).toBeNull();
      expect(streamed.originalStat).not.toBeNull();
    }
  });

  it('resolves a path under a non-directory as a new file', async () => {
    const memFs = create(createMemFs<MemFsEditorFile>());

    // `file.txt` is a file, so `file.txt/nested` cannot exist: resolving
    // the original reports a new file instead of failing.
    fs.writeFileSync(path.join(output, 'file.txt'), 'a file');
    memFs.write(path.join(output, 'file.txt', 'nested'), 'contents');

    for await (const streamed of memFs.stream()) {
      expect(streamed.state).toBe('added');
      expect(streamed.originalContents).toBeNull();
      expect(streamed.changed).toBe(true);
    }
  });

  it('throws when writing over a directory path', async () => {
    const memFs = create(createMemFs<MemFsEditorFile>());

    // Persisting over a directory fails on any channel, the same way
    // `commit()` does.
    memFs.write(output, 'contents');

    await expect(async () => {
      for await (const _change of memFs.stream()) {
        // drains until the throw
      }
    }).rejects.toThrow(/is not a file/v);
  });

  it('propagates errors reading the original', async () => {
    const memFs = create(createMemFs<MemFsEditorFile>());

    const file = path.join(output, 'unreadable.txt');
    fs.writeFileSync(file, 'contents');
    fs.chmodSync(file, 0o000);
    memFs.write(file, 'updated');
    fs.chmodSync(file, 0o644);

    // The file is readable again, but resolving the original through a
    // mocked permission error propagates instead of reporting a new file.
    const { readFileSync } = fs;
    vi.spyOn(fs, 'readFileSync').mockImplementation((...args) => {
      if (args[0] === file) {
        throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
      }

      return readFileSync(...args);
    });

    await expect(async () => {
      for await (const _change of memFs.stream()) {
        // drains until the throw
      }
    }).rejects.toThrow(/permission denied/v);

    vi.mocked(fs.readFileSync).mockRestore();
  });

  it('propagates stat errors resolving the original', async () => {
    const memFs = create(createMemFs<MemFsEditorFile>());

    const file = path.join(output, 'stat-error.txt');
    memFs.write(file, 'updated');

    const { statSync } = fs;
    vi.spyOn(fs, 'statSync').mockImplementation((...args) => {
      if (args[0] === file) {
        throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
      }

      return statSync(...args);
    });

    await expect(async () => {
      for await (const _change of memFs.stream()) {
        // drains until the throw
      }
    }).rejects.toThrow(/permission denied/v);

    vi.mocked(fs.statSync).mockRestore();
  });

  it('resolves the original of a path statSync reports as ENOTDIR', async () => {
    const memFs = create(createMemFs<MemFsEditorFile>());

    const file = path.join(output, 'enotdir.txt');
    memFs.write(file, 'updated');

    const { statSync } = fs;
    vi.spyOn(fs, 'statSync').mockImplementation((...args) => {
      if (args[0] === file) {
        throw Object.assign(new Error('not a directory'), { code: 'ENOTDIR' });
      }

      return statSync(...args);
    });

    for await (const streamed of memFs.stream()) {
      expect(streamed.state).toBe('added');
      expect(streamed.originalContents).toBeNull();
    }

    vi.mocked(fs.statSync).mockRestore();
  });

  describe('markCommitted()', () => {
    it('resets the pending state like commit() does, without touching the disk', async () => {
      const memFs = create(createMemFs<MemFsEditorFile>());

      const file = path.join(output, 'manual.txt');
      fs.writeFileSync(file, 'original');
      memFs.write(file, 'updated');

      let seen = 0;
      for await (const change of memFs.stream()) {
        seen += 1;
        expect(change.state).toBe('modified');
        if (change.contents === null) {
          throw new Error('expected contents');
        }

        expect(change.contents.toString()).toBe('updated');
        // Consumer persists the file itself.
        fs.writeFileSync(change.path, change.contents);
        change.markCommitted();
      }

      expect(seen).toBe(1);
      expect(memFs.store.get(file).state).toBeUndefined();
      expect(memFs.store.get(file).committed).toBe(true);
      expect(fs.readFileSync(file, 'utf8')).toBe('updated');

      // Files marked as committed are not pending anymore.
      const stillPending = [];
      for await (const change of memFs.stream()) {
        stillPending.push(change);
      }
      expect(stillPending).toEqual([]);
    });
  });

  describe('skip-unchanged-files usage', () => {
    it('lets the consumer only persist files that actually changed', async () => {
      const memFs = create(createMemFs<MemFsEditorFile>());

      const unchanged = path.join(output, 'unchanged.txt');
      const changed = path.join(output, 'changed.txt');
      fs.writeFileSync(unchanged, 'same');
      fs.writeFileSync(changed, 'old');
      memFs.read(unchanged);
      memFs.read(changed);
      memFs.write(unchanged, 'same');
      memFs.write(changed, 'new');

      const written = new Set<string>();
      for await (const change of memFs.stream()) {
        if (change.contents === null) {
          throw new Error('expected contents');
        }

        if (change.changed) {
          fs.writeFileSync(change.path, change.contents);
          written.add(change.path);
        }

        change.markCommitted();
      }

      expect(written).toEqual(new Set([changed]));
      expect(fs.readFileSync(unchanged, 'utf8')).toBe('same');
      expect(fs.readFileSync(changed, 'utf8')).toBe('new');
    });
  });

  describe('diff-against-original usage', () => {
    it('yields the original contents to diff against', async () => {
      const memFs = create(createMemFs<MemFsEditorFile>());

      const file = path.join(output, 'diff.txt');
      fs.writeFileSync(file, 'line 1\nline 2\n');
      memFs.read(file);
      memFs.write(file, 'line 1\nline 2 edited\n');

      for await (const change of memFs.stream()) {
        const patch = diffLines(
          change.originalContents?.toString() ?? '',
          change.contents?.toString() ?? '',
        );
        expect(patch).toEqual(['- line 2', '+ line 2 edited']);
      }
    });
  });
});
