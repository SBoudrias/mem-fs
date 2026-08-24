import { describe, beforeEach, it, expect, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { type MemFsEditor, type MemFsEditorFile, create } from '../src/index.ts';
import { create as createMemFs } from 'mem-fs';
import { getFixture } from './fixtures.ts';
import multimatch from 'multimatch';
import { type GlobOptions } from 'tinyglobby';
import normalizePath from 'normalize-path';

// tinyglobby's `glob`/`globSync` each have a deprecated options-only overload,
// so the mocks are typed and referenced through these non-deprecated signatures.
type TinyglobbyMocks = {
  glob: (
    patterns: string | readonly string[],
    options?: Omit<GlobOptions, 'patterns'>,
  ) => Promise<string[]>;
  globSync: (
    patterns: string | readonly string[],
    options?: Omit<GlobOptions, 'patterns'>,
  ) => string[];
};

const tinyglobbyMocks = vi.hoisted(() => ({
  glob: vi.fn<TinyglobbyMocks['glob']>(),
  globSync: vi.fn<TinyglobbyMocks['globSync']>(),
}));

vi.mock(import('multimatch'), async (importOriginal) => {
  const actual = await importOriginal<{ default: typeof multimatch }>();
  return {
    ...actual,
    default: vi.fn<typeof multimatch>().mockImplementation(actual.default),
  };
});

// The `import()` module form types `importOriginal` as the real module, which
// forces references to tinyglobby's deprecated options-only glob/globSync
// overloads (typescript/no-deprecated). The string form keeps the mocks typed
// through the non-deprecated signatures above.
// oxlint-disable-next-line vitest/prefer-import-in-mock
vi.mock('tinyglobby', async (importOriginal) => {
  const actual = await importOriginal<TinyglobbyMocks>();
  tinyglobbyMocks.glob.mockImplementation(actual.glob);
  tinyglobbyMocks.globSync.mockImplementation(actual.globSync);
  return {
    ...actual,
    glob: tinyglobbyMocks.glob,
    globSync: tinyglobbyMocks.globSync,
  };
});

describe('#copyTpl()', () => {
  let memFs: MemFsEditor;

  beforeEach(() => {
    memFs = create(createMemFs<MemFsEditorFile>());
  });

  it("doesn't accept async EJS rendering", () => {
    expect(() => {
      memFs.copyTpl('', '', {}, { transformOptions: { async: true } });
    }).toThrow('Async EJS rendering is not supported');
  });
});

describe.each(['copyTpl', 'copyTplAsync'] as const)('#%s()', (method) => {
  let memFs: MemFsEditor;

  beforeEach(() => {
    memFs = create(createMemFs<MemFsEditorFile>());
  });

  it(`${method === 'copyTpl' ? "doesn't return" : 'returns'} a promise`, () => {
    const filepath = getFixture('file-a.txt');
    const newPath = '/new/path/file.txt';
    const ret = memFs[method](filepath, newPath);
    expect(ret instanceof Promise).toBe(method !== 'copyTpl');
  });

  it('copy file and process contents as underscore template', async () => {
    const filepath = getFixture('file-tpl.txt');
    const newPath = '/new/path/file.txt';
    await memFs[method](filepath, newPath, { name: 'new content' });
    expect(memFs.read(newPath)).toBe(`new content${os.EOL}`);
  });

  it('fallback to memory file', async () => {
    const filepath = getFixture('file-tpl.txt');
    await memFs.copyAsync(filepath, `${filepath}.mem`);
    const newPath = '/new/path/file.txt';
    await memFs[method](`${filepath}.mem`, newPath, { name: 'new content' });
    expect(memFs.read(newPath)).toBe(`new content${os.EOL}`);
  });

  it('fallback to memory file with array', async () => {
    const filepath = getFixture('file-tpl.txt');
    await memFs.copyAsync(filepath, `${filepath}.mem`);
    const newPath = '/new/path/';
    await memFs[method]([`${filepath}.mem`], newPath, { name: 'new content' });
    expect(memFs.read(`${newPath}file-tpl.txt.mem`)).toBe(`new content${os.EOL}`);
  });

  it('allow setting custom template delimiters', async () => {
    const filepath = getFixture('file-tpl-custom-delimiter.txt');
    const newPath = '/new/path/file.txt';
    await memFs[method](
      filepath,
      newPath,
      { name: 'mustache' },
      {
        transformOptions: { delimiter: '?' },
      },
    );
    expect(memFs.read(newPath)).toBe(`mustache${os.EOL}`);
  });

  it('allow including partials', async () => {
    const filepath = getFixture('file-tpl-include.txt');
    const newPath = '/new/path/file.txt';
    await memFs[method](filepath, newPath);
    expect(memFs.read(newPath)).toBe(`partial${os.EOL}${os.EOL}`);
  });

  it('allow appending files', async () => {
    const filepath = getFixture('file-tpl.txt');
    const newPath = '/new/path/file-append.txt';
    await memFs[method](filepath, newPath, { name: 'new content' });
    expect(memFs.read(newPath)).toBe(`new content${os.EOL}`);
    await memFs[method](filepath, newPath, { name: 'new content' }, { append: true });
    expect(memFs.read(newPath)).toBe(`new content${os.EOL}new content${os.EOL}`);
  });

  it('should pass globOptions to glob', async () => {
    const globOptions = { debug: false } as const;
    const filepath = getFixture('file-tpl-partial.*');
    await memFs[method](
      [filepath],
      '/new/path/',
      {},
      { globOptions, fromBasePath: getFixture() },
    );

    expect(
      method === 'copyTpl' ? tinyglobbyMocks.globSync : tinyglobbyMocks.glob,
    ).toHaveBeenCalledWith(
      [normalizePath(filepath)],
      expect.objectContaining(globOptions),
    );
  });

  it('should fail when passing noGlob and globOptions', async () => {
    const from = ['foo'];
    const dest = '/new/path/';
    const data = {};
    const options = { globOptions: { debug: false }, noGlob: true };
    const expectedError = '`noGlob` and `globOptions` are mutually exclusive';
    if (method === 'copyTpl') {
      expect(() => {
        memFs[method](from, dest, data, options);
      }).toThrow(expectedError);
    } else {
      await expect(memFs[method](from, dest, data, options)).rejects.toThrow(
        expectedError,
      );
    }
  });

  it('should pass storeMatchOptions to multimatch', async () => {
    const storeMatchOptions = { debug: false } as const;
    const filepath = getFixture('file-tpl-partial.*');
    await memFs[method](
      [filepath],
      '/new/path/',
      {},
      { storeMatchOptions, fromBasePath: getFixture() },
    );

    expect(multimatch).toHaveBeenCalledWith(
      expect.any(Array),
      [normalizePath(filepath)],
      storeMatchOptions,
    );
  });

  it('should fail when passing noGlob and storeMatchOptions', async () => {
    const expectedError = '`noGlob` and `storeMatchOptions` are mutually exclusive';
    const from = ['foo'];
    const dest = '/new/path/';
    const data = {};
    const options = { storeMatchOptions: { debug: false }, noGlob: true };
    if (method === 'copyTpl') {
      expect(() => {
        memFs[method](from, dest, data, options);
      }).toThrow(expectedError);
    } else {
      await expect(memFs[method](from, dest, data, options)).rejects.toThrow(
        expectedError,
      );
    }
  });

  it('perform no substitution on binary files', async () => {
    const filepath = getFixture('file-binary.bin');
    const newPath = '/new/path/file.bin';
    await memFs[method](filepath, newPath);
    expect(memFs.read(newPath)).toBe(memFs.read(filepath));
  });

  it('perform no substitution on binary files from memory file store', async () => {
    const filepath = getFixture('file-binary.bin');
    const pathCopied = path.resolve('/new/path/file-inmemory.bin');
    const newPath = '/new/path/file.bin';
    memFs.copy(filepath, pathCopied);
    await memFs[method](pathCopied, newPath);
    expect(memFs.read(newPath)).toBe(memFs.read(filepath));
  });

  it('allow passing circular function context', async () => {
    type CircularContext = {
      name?: string;
      a?: CircularContext;
      b?: CircularContext;
    };
    const b: CircularContext = {};
    const a = { name: 'new content', b };
    b.a = a;
    const filepath = getFixture('file-circular.txt');
    const newPath = '/new/path/file.txt';
    await memFs[method](
      filepath,
      newPath,
      {},
      {
        transformOptions: { context: { a } },
      },
    );
    expect(memFs.read(newPath)).toBe(`new content new content${os.EOL}`);
  });

  it('removes ejs extension when globbing', async () => {
    const filepath = getFixture('ejs');
    const newPath = '/new/path/';
    await memFs[method](filepath, newPath);
    expect(memFs.exists(path.join(newPath, 'file-ejs-extension.txt'))).toBeTruthy();
  });

  it('processes both filepath and content as templates', async () => {
    const filepath = getFixture('file-tpl.txt');
    const newPath = '/new/<%= name %>/file.txt';
    await memFs[method](filepath, newPath, { name: 'bar' });
    // Check that both path and content were processed
    expect(memFs.exists('/new/bar/file.txt')).toBeTruthy();
    expect(memFs.read('/new/bar/file.txt')).toBe(`bar${os.EOL}`);
  });

  it('keeps template path in file history', async () => {
    const filepath = getFixture('file-tpl.txt');
    const newPath = '/new/path/file.txt';
    await memFs[method](filepath, newPath, { name: 'new content' });
    expect(memFs.store.get(newPath)['history']).toMatchObject([
      path.resolve(filepath),
      path.resolve(newPath),
    ]);
  });

  it('does not remove ejs extension when the destination path ends with .ejs', async () => {
    const filepath = getFixture('ejs/file-ejs-extension.txt.ejs');
    const newPath = '/new/path/file-ejs-extension.txt.ejs';
    await memFs[method](filepath, newPath);
    expect(memFs.exists(newPath)).toBeTruthy();
  });
});
