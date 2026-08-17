import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadFile, loadFileAsync } from '../src/index.ts';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('loadFile()', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'mfe-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('should return contents=null for directories', () => {
    const file = loadFile(dir);
    expect(file).toBeTruthy();
    expect(file.stat?.isDirectory()).toBe(true);
    expect(file.contents).toBeNull();
  });

  it('should return file contents', () => {
    const filepath = path.join(dir, 'file.txt');
    writeFileSync(filepath, 'content');
    const file = loadFile(filepath);
    expect(file.contents).toStrictEqual(Buffer.from('content'));
  });

  it('should return contents=null for non-existent files', () => {
    const file = loadFile(path.join(dir, 'does-not-exist.txt'));
    expect(file.contents).toBeNull();
  });
});

describe('loadFileAsync()', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'mfe-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('should return contents=null for directories', async () => {
    const file = await loadFileAsync(dir);
    expect(file).toBeTruthy();
    expect(file.stat?.isDirectory()).toBe(true);
    expect(file.contents).toBeNull();
  });

  it('should return file contents', async () => {
    const filepath = path.join(dir, 'file.txt');
    writeFileSync(filepath, 'content');
    const file = await loadFileAsync(filepath);
    expect(file.contents).toStrictEqual(Buffer.from('content'));
  });

  it('should return contents=null for non-existent files', async () => {
    const file = await loadFileAsync(path.join(dir, 'does-not-exist.txt'));
    expect(file.contents).toBeNull();
  });

  it('should throw on non-ENOENT error', async () => {
    const filepath = path.join(dir, 'file.txt');
    writeFileSync(filepath, 'content');
    await expect(loadFileAsync(path.join(filepath, 'nested'))).rejects.toThrow();
  });
});
