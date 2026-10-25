import path from 'node:path';
import os from 'node:os';
import { describe, beforeEach, it, expect, vi } from 'vitest';
import { applyEdits, modify, parse as parseJSONC, type JSONPath } from 'jsonc-parser';
import {
  type JSONStringify,
  type MemFsEditor,
  type MemFsEditorFile,
  create,
} from '../src/index.ts';
import { create as createMemFs } from 'mem-fs';
import { getFixture } from './fixtures.ts';

const tsconfigPath = path.join(os.tmpdir(), 'mem-fs-editor-jsonc', 'tsconfig.json');

const tsconfigJSONC = `{
  // compiler options
  "compilerOptions": {
    /* base options */
    "target": "ES2022",
    "module": "commonjs"
  }
}
`;

function collectEdits(
  basePath: JSONPath,
  newValue: unknown,
  originalValue: unknown,
): [JSONPath, unknown][] {
  if (
    newValue === null ||
    typeof newValue !== 'object' ||
    Array.isArray(newValue) ||
    originalValue === null ||
    typeof originalValue !== 'object' ||
    Array.isArray(originalValue)
  ) {
    return newValue === originalValue ? [] : [[basePath, newValue]];
  }

  const edits: [JSONPath, unknown][] = [];
  const originalRecord: Record<string, unknown> = { ...originalValue };
  for (const [key, value] of Object.entries(newValue)) {
    edits.push(...collectEdits([...basePath, key], value, originalRecord[key]));
  }

  return edits;
}

/**
 * Minimal patch-aware serializer in the style a consumer would provide: it
 * patches only the values that changed in the original document, so comments,
 * key order and formatting are preserved.
 */
function patchStringify(originalText: string | undefined, value: unknown): string {
  if (originalText === undefined) {
    // New file: nothing to patch, serialize from scratch.
    return `${JSON.stringify(value, null, 2)}
`;
  }

  let text = originalText;
  const edits = collectEdits([], value, parseJSONC(originalText));
  for (const [jsonPath, editValue] of edits) {
    text = applyEdits(
      text,
      modify(text, jsonPath, editValue, {
        formattingOptions: { insertSpaces: true, tabSize: 2 },
      }),
    );
  }

  return text;
}

describe('jsonc round-trip with a consumer-provided parser', () => {
  let memFs: MemFsEditor;

  beforeEach(() => {
    memFs = create(createMemFs<MemFsEditorFile>(), {
      parse: parseJSONC as (text: string) => unknown,
      stringify: patchStringify,
    });
  });

  it('readJSON() reads a commented JSONC file', () => {
    memFs.write(tsconfigPath, tsconfigJSONC);
    expect(memFs.readJSON(tsconfigPath)).toEqual({
      compilerOptions: { target: 'ES2022', module: 'commonjs' },
    });
  });

  it('extendJSON() patches a commented tsconfig.json without touching comments', () => {
    memFs.write(tsconfigPath, tsconfigJSONC);
    memFs.extendJSON(tsconfigPath, { compilerOptions: { strict: true } });

    expect(memFs.read(tsconfigPath)).toBe(`{
  // compiler options
  "compilerOptions": {
    /* base options */
    "target": "ES2022",
    "module": "commonjs",
    "strict": true
  }
}
`);
  });

  it('extendJSON() updates an existing value in place', () => {
    memFs.write(tsconfigPath, tsconfigJSONC);
    memFs.extendJSON(tsconfigPath, { compilerOptions: { target: 'ES2020' } });

    expect(memFs.read(tsconfigPath)).toBe(`{
  // compiler options
  "compilerOptions": {
    /* base options */
    "target": "ES2020",
    "module": "commonjs"
  }
}
`);
  });

  it('readJSON() round-trips the patched file', () => {
    memFs.write(tsconfigPath, tsconfigJSONC);
    memFs.extendJSON(tsconfigPath, {
      compilerOptions: { strict: true, target: 'ES2020' },
    });

    expect(memFs.readJSON(tsconfigPath)).toEqual({
      compilerOptions: {
        target: 'ES2020',
        module: 'commonjs',
        strict: true,
      },
    });
  });

  it('writeJSON() serializes new files from scratch', () => {
    const contents = { compilerOptions: { target: 'ES2022' } };
    memFs.writeJSON(tsconfigPath, contents);

    expect(memFs.read(tsconfigPath)).toBe(`${JSON.stringify(contents, null, 2)}
`);
  });

  it('writeJSON() receives the original text of the target file', () => {
    const stringify = vi.fn<JSONStringify>(patchStringify);
    const editor = create(createMemFs<MemFsEditorFile>(), { stringify });
    editor.write(tsconfigPath, tsconfigJSONC);

    editor.writeJSON(tsconfigPath, { foo: 'bar' });

    expect(stringify).toHaveBeenCalledOnce();
    expect(stringify).toHaveBeenCalledWith(tsconfigJSONC, { foo: 'bar' });
  });

  it('writeJSON() passes undefined to the hook for a new file', () => {
    const stringify = vi.fn<JSONStringify>(patchStringify);
    const editor = create(createMemFs<MemFsEditorFile>(), { stringify });

    editor.writeJSON(tsconfigPath, { foo: 'bar' });

    expect(stringify).toHaveBeenCalledWith(undefined, { foo: 'bar' });
  });

  it('a per-call parse option overrides the editor parser', () => {
    // Editor-level parse deliberately fails; only the per-call option can make
    // this read succeed, proving it takes precedence.
    const editor = create(createMemFs<MemFsEditorFile>(), {
      parse: () => {
        throw new Error('editor parser should not be used');
      },
    });

    expect(
      editor.readJSON(getFixture('file.json'), undefined, { parse: JSON.parse }),
    ).toEqual({ foo: 'bar' });
  });

  it('a per-call parser without stringify falls back to the editor one', () => {
    const editor = create(createMemFs<MemFsEditorFile>(), {
      stringify: () => 'editor stringify',
    });

    editor.writeJSON(tsconfigPath, { foo: 'bar' }, undefined, undefined, undefined, {
      parse: JSON.parse,
    });

    expect(editor.read(tsconfigPath)).toBe('editor stringify');
  });

  it('a per-call stringify option overrides the editor parser', () => {
    const stringify = vi.fn<JSONStringify>(() => 'per-call');
    const editor = create(createMemFs<MemFsEditorFile>());
    editor.write(tsconfigPath, tsconfigJSONC);

    editor.writeJSON(tsconfigPath, { foo: 'bar' }, undefined, undefined, undefined, {
      stringify,
    });

    expect(stringify).toHaveBeenCalledWith(tsconfigJSONC, { foo: 'bar' });
    expect(editor.read(tsconfigPath)).toBe('per-call');
  });
});
