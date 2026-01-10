import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadFile } from '../src/index.ts';
import { describe, it, expect } from 'vitest';

describe('loadFile', () => {
  it('should return contents=null for directories', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'mfe-'));
    const file = loadFile(dir);
    expect(file).toBeTruthy();
    expect(file.stat?.isDirectory?.()).toBe(true);
    expect(file.contents).toBeNull();
  });
});
