import path from 'node:path';
import os from 'node:os';
import { describe, beforeEach, it, expect, vi } from 'vitest';
import {
  applyEdits,
  modify,
  parse as parseJSONC,
  type JSONPath,
  type ParseError,
} from 'jsonc-parser';
import {
  MemFsEditor,
  type JSONParser,
  type JSONStringify,
  type JSONStringifyContext,
  type MemFsEditorFile,
  create,
} from '../src/index.ts';
import { create as createMemFs } from 'mem-fs';

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

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * jsonc-parser's `parse` never throws: it returns a best-effort value and
 * collects errors. A safe `parse` hook must check the errors and throw, so
 * malformed files are reported instead of silently read as partial objects.
 */
function safeParseJSONC(text: string): unknown {
  const errors: ParseError[] = [];
  // Strip a leading BOM: jsonc-parser reports it as a parse error.
  const value: unknown = parseJSONC(text.replace(/^\uFEFF/u, ''), errors);
  if (errors.length > 0) {
    throw new Error(`Invalid JSONC document (${errors.length} parse errors)`);
  }

  return value;
}

function collectEdits(
  basePath: JSONPath,
  newValue: unknown,
  originalValue: unknown,
): [JSONPath, unknown][] {
  if (isPlainObject(newValue) && isPlainObject(originalValue)) {
    const edits: [JSONPath, unknown][] = [];
    for (const [key, value] of Object.entries(newValue)) {
      edits.push(...collectEdits([...basePath, key], value, originalValue[key]));
    }

    // writeJSON() means replace: keys of the original that are absent from the
    // new value are removed.
    for (const key of Object.keys(originalValue)) {
      if (!(key in newValue)) {
        edits.push([[...basePath, key], undefined]);
      }
    }

    return edits;
  }

  // Primitives and arrays are replaced wholesale (keeping the change minimal
  // by skipping identical values).
  return JSON.stringify(newValue) === JSON.stringify(originalValue)
    ? []
    : [[basePath, newValue]];
}

/**
 * Minimal patch-aware serializer in the style a consumer would provide: it
 * patches only the values that changed in the original document, so comments,
 * key order and formatting are preserved.
 */
function patchStringify(value: unknown, context: JSONStringifyContext): string {
  const space = context.space ?? 2;
  const { originalText, original, replacer } = context;
  if (
    originalText === undefined ||
    originalText.trim() === '' ||
    original === undefined
  ) {
    // New (or empty/unparseable) file: nothing to patch, serialize from scratch.
    const json =
      typeof replacer === 'function'
        ? JSON.stringify(value, replacer, space)
        : JSON.stringify(value, replacer, space);
    return `${json}\n`;
  }

  let text = originalText;
  const edits = collectEdits([], value, context.original);
  for (const [jsonPath, editValue] of edits) {
    text = applyEdits(
      text,
      modify(text, jsonPath, editValue, {
        formattingOptions: {
          insertSpaces: true,
          tabSize: typeof space === 'number' ? space : 2,
        },
      }),
    );
  }

  return text;
}

const createJSONCEditor = (json: Partial<JSONParser> = {}): MemFsEditor =>
  create(createMemFs<MemFsEditorFile>(), {
    json: { parse: safeParseJSONC, stringify: patchStringify, ...json },
  });

describe('jsonc round-trip with a consumer-provided parser', () => {
  let memFs: MemFsEditor;

  beforeEach(() => {
    memFs = createJSONCEditor();
  });

  it('readJSON() reads a commented JSONC file', () => {
    memFs.write(tsconfigPath, tsconfigJSONC);
    expect(memFs.readJSON(tsconfigPath)).toEqual({
      compilerOptions: { target: 'ES2022', module: 'commonjs' },
    });
  });

  it('readJSON() throws on a malformed JSONC file', () => {
    memFs.write(tsconfigPath, '{ "target": "ES2022", ');

    expect(() => memFs.readJSON(tsconfigPath)).toThrow(
      `Could not parse JSON in file: ${tsconfigPath}`,
    );
  });

  it('readJSON() reports non-Error throwables from the parse hook', () => {
    const editor = createJSONCEditor({
      parse: () => {
        // A user hook may throw a non-Error; deliberately not an Error object.
        // oxlint-disable-next-line eslint/no-throw-literal typescript/only-throw-error
        throw 'not an Error';
      },
    });
    editor.write(tsconfigPath, '{}');

    expect(() => editor.readJSON(tsconfigPath)).toThrow(
      `Could not parse JSON in file: ${tsconfigPath}. Detail: not an Error`,
    );
  });

  it('readJSON() throws on an empty file (empty is not valid JSONC)', () => {
    memFs.write(tsconfigPath, '');

    expect(() => memFs.readJSON(tsconfigPath)).toThrow(/parse JSON in file/u);
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

  it('writeJSON() replaces the document: keys absent from the value are removed', () => {
    memFs.write(tsconfigPath, tsconfigJSONC);
    memFs.writeJSON(tsconfigPath, { compilerOptions: { target: 'ES2020' } });

    expect(memFs.read(tsconfigPath)).toBe(`{
  // compiler options
  "compilerOptions": {
    /* base options */
    "target": "ES2020"
  }
}
`);
  });

  it('writeJSON() replaces arrays wholesale', () => {
    memFs.write(
      tsconfigPath,
      `{
  // keep me
  "list": [1, 2],
  "kept": true
}`,
    );
    memFs.writeJSON(tsconfigPath, { kept: true, list: [3] });

    // The array is replaced (not merged), the comment survives.
    expect(memFs.read(tsconfigPath)).toBe(`{
  // keep me
  "list": [
    3
  ],
  "kept": true
}`);
  });

  it('writeJSON() writes a pending-deleted file as new (no original text)', () => {
    memFs.write(tsconfigPath, tsconfigJSONC);
    memFs.delete(tsconfigPath);
    memFs.writeJSON(tsconfigPath, { fresh: true });

    expect(memFs.read(tsconfigPath)).toBe(
      `${JSON.stringify({ fresh: true }, null, 2)}\n`,
    );
  });

  it('writeJSON() sees an existing empty file as originalText "" (not undefined)', () => {
    const stringify = vi.fn<JSONStringify>(patchStringify);
    const editor = createJSONCEditor({ stringify });
    editor.write(tsconfigPath, '');

    editor.writeJSON(tsconfigPath, { a: 1 });

    expect(stringify).toHaveBeenCalledWith(
      { a: 1 },
      expect.objectContaining({ originalText: '' }),
    );
  });

  it('writeJSON() passes undefined originalText for a new file', () => {
    const stringify = vi.fn<JSONStringify>(patchStringify);
    const editor = createJSONCEditor({ stringify });

    editor.writeJSON(tsconfigPath, { a: 1 });

    expect(stringify).toHaveBeenCalledWith(
      { a: 1 },
      expect.objectContaining({ originalText: undefined }),
    );
  });

  it('writeJSON() receives the original text and parsed original of the target file', () => {
    const stringify = vi.fn<JSONStringify>(patchStringify);
    const editor = createJSONCEditor({ stringify });
    editor.write(tsconfigPath, tsconfigJSONC);

    editor.writeJSON(tsconfigPath, { foo: 'bar' });

    expect(stringify).toHaveBeenCalledWith(
      { foo: 'bar' },
      expect.objectContaining({
        filepath: tsconfigPath,
        originalText: tsconfigJSONC,
        original: { compilerOptions: { target: 'ES2022', module: 'commonjs' } },
      }),
    );
  });

  it('writeJSON() receives undefined original when the original text does not parse', () => {
    memFs.write(tsconfigPath, '{ "a": 1, ');
    memFs.writeJSON(tsconfigPath, { a: 2 });

    expect(memFs.read(tsconfigPath)).toBe(`${JSON.stringify({ a: 2 }, null, 2)}\n`);
  });

  it('writeJSON() passes replacer and space to the stringify hook', () => {
    const stringify = vi.fn<JSONStringify>(patchStringify);
    const editor = createJSONCEditor({ stringify });
    editor.write(tsconfigPath, tsconfigJSONC);

    editor.writeJSON(
      tsconfigPath,
      { compilerOptions: { target: 'ES2022' } },
      ['compilerOptions'],
      4,
    );

    expect(stringify).toHaveBeenCalledWith(
      { compilerOptions: { target: 'ES2022' } },
      expect.objectContaining({ replacer: ['compilerOptions'], space: 4 }),
    );
  });

  it('writeJSON() honors space for new files through the hook', () => {
    memFs.writeJSON(tsconfigPath, { a: 1 }, undefined, 4);

    expect(memFs.read(tsconfigPath)).toBe(`${JSON.stringify({ a: 1 }, null, 4)}\n`);
  });

  it('the original text is passed through as-is, including a leading BOM', () => {
    memFs.write(tsconfigPath, `\uFEFF${tsconfigJSONC}`);
    memFs.extendJSON(tsconfigPath, { compilerOptions: { strict: true } });

    const contents = memFs.read(tsconfigPath);
    expect(contents.startsWith('\uFEFF')).toBe(true);
    expect(contents).toContain('// compiler options');
    expect(contents).toContain('"strict": true');
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

  it('a parse-only config falls back to JSON.stringify and loses comments (documented)', () => {
    const parseOnly = create(createMemFs<MemFsEditorFile>(), {
      json: { parse: safeParseJSONC },
    });
    parseOnly.write(tsconfigPath, tsconfigJSONC);
    parseOnly.extendJSON(tsconfigPath, { compilerOptions: { strict: true } });

    expect(parseOnly.read(tsconfigPath)).toBe(
      `${JSON.stringify(
        { compilerOptions: { target: 'ES2022', module: 'commonjs', strict: true } },
        null,
        2,
      )}\n`,
    );
  });

  it('a per-call json option overrides the editor-level parser', () => {
    const editor = createJSONCEditor({
      parse: () => {
        throw new Error('editor parser should not be used');
      },
    });
    editor.write(tsconfigPath, tsconfigJSONC);

    expect(
      editor.readJSON(tsconfigPath, undefined, { json: { parse: safeParseJSONC } }),
    ).toEqual({ compilerOptions: { target: 'ES2022', module: 'commonjs' } });
  });

  it('a per-call json.stringify option overrides the editor-level one', () => {
    const stringify = vi.fn<JSONStringify>(() => 'per-call');
    const editor = createJSONCEditor();
    editor.write(tsconfigPath, tsconfigJSONC);

    editor.writeJSON(tsconfigPath, { foo: 'bar' }, undefined, undefined, {
      json: { stringify },
    });

    expect(stringify).toHaveBeenCalledWith(
      { foo: 'bar' },
      expect.objectContaining({ originalText: tsconfigJSONC }),
    );
    expect(editor.read(tsconfigPath)).toBe('per-call');
  });

  it('a per-call json option without stringify falls back to the editor one', () => {
    const editor = createJSONCEditor();
    editor.write(tsconfigPath, tsconfigJSONC);

    editor.writeJSON(tsconfigPath, { a: 1 }, undefined, undefined, {
      json: { parse: safeParseJSONC },
    });

    expect(editor.read(tsconfigPath)).toBe(`${JSON.stringify({ a: 1 }, null, 2)}\n`);
  });

  it('new MemFsEditor(store, options) accepts the same json options', () => {
    const editor = new MemFsEditor(createMemFs<MemFsEditorFile>(), {
      json: { parse: safeParseJSONC, stringify: patchStringify },
    });
    editor.write(tsconfigPath, tsconfigJSONC);
    editor.extendJSON(tsconfigPath, { compilerOptions: { strict: true } });

    expect(editor.read(tsconfigPath)).toContain('// compiler options');
  });
});
