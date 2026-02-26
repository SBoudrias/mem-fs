import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadFile, loadFileAsync } from '../src/index.ts';
import { describe, it, expect } from 'vitest';

describe('loadFile', () => {
  it('should return contents=null for directories', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'mfe-'));
    const file = loadFile(dir);
    expect(file).toBeTruthy();
    expect(file.stat?.isDirectory?.()).toBe(true);
    expect(file.contents).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });

  it('should return contents=null for directories (async)', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'mfe-'));
    const file = await loadFileAsync(dir);
    expect(file).toBeTruthy();
    expect(file.stat?.isDirectory?.()).toBe(true);
    expect(file.contents).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });
});
