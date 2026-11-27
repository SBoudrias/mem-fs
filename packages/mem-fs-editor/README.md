# mem-fs-editor

[![NPM version](https://badge.fury.io/js/mem-fs-editor.svg)](http://badge.fury.io/js/mem-fs-editor)
[![Coverage Status](https://codecov.io/gh/SBoudrias/mem-fs-editor/branch/master/graph/badge.svg)](https://codecov.io/gh/SBoudrias/mem-fs-editor)

File edition helpers working on top of [mem-fs](https://github.com/SBoudrias/mem-fs)

## Usage

```js
import { create as createMemFs } from 'mem-fs';
import { create as createEditor } from 'mem-fs-editor';

const store = createMemFs();
const fs = createEditor(store);

fs.write('somefile.js', 'var a = 1;');
await fs.commit();
```

### `#read(filepath, [options])`

Read a file and return its contents as a string.

You can alternatively get the raw contents buffer if you pass `options.raw = true`.

By default, calling `read()` on a file path that does not exist throws error. You can, however, pass `options.defaults = 'your default content'` to get a default content you pass in, if you prefer to not deal with try/catch.

### `#readJSON(filepath, [defaults [, options]])`

Read a file and parse its contents as JSON.

`readJSON()` internally calls `read()` but will not throw an error if the file path you pass in does not exist. If you pass in an optional `defaults`, the `defaults` content will be returned in case of the target file is missing, instead of `undefined`. (Error would still be thrown if `JSON.parse` failed to parse your target file.)

Optionally pass `options.json` to override the JSON handling for this single call — see [Custom JSON handling (JSONC)](#custom-json-handling-jsonc).

### `#write(filepath, contents[, options])`

Replace the content of a file (existing or new) with a string or a buffer.

Optionally pass an `options` object:

- `options.stat`: A `fs.Stats` object to attach to the file.
- `options.metadata`: An arbitrary object attached to the file as `editorMetadata`, available during `store.each()` and commit transforms. See [File metadata](#file-metadata).

> **Deprecated:** Passing a bare `fs.Stats` as the third argument (`write(filepath, contents, stat)`) is deprecated. Use the `WriteOptions` object form instead: `write(filepath, contents, { stat })`.

### `#writeJSON(filepath, contents[, replacer [, space [, options]]])`

Replace the content of a file (existing or new) with an object that is to be converted by calling `JSON.stringify()`.

`contents` should usually be a JSON object, but it can technically be anything that is acceptable by [JSON.stringify](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify).

Optionally pass `replacer` and `space` as the last two arguments, as defined by [JSON.stringify](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify). `spacer` is used to format the output string (prettify).

Default value for `space` is `2`, when not specified.

Optionally pass an `options` object: the same `#write()` options, plus `options.json` to override the JSON handling for this single call — see [Custom JSON handling (JSONC)](#custom-json-handling-jsonc).

### `#append(filepath, contents, [options])`

Append the new contents to the current file contents.

- `options.trimEnd` (default `true`). Trim trailing whitespace of the current file contents.
- `options.separator` (default `os.EOL`). Separator to insert between current and new contents.
- `options.create` (default `false`). Create the file if doesn't exists.
- `options.metadata`: An arbitrary object attached to the file as `editorMetadata`. See [File metadata](#file-metadata).

### `#appendTpl(filepath, contents, data[, options])`

Append the new `contents` to the existing `filepath` content and parse the new contents as an [ejs](http://ejs.co/) template where `data` is the template context (the variable names available inside the template).

- `options.trimEnd` (default `true`). Trim trailing whitespace of the current file contents.
- `options.separator` (default `os.EOL`). Separator to insert between current and new contents.
- `options.transformOptions`. Options passed to the EJS renderer when processing the template, similar to `copyTpl`.

### `#extendJSON(filepath, contents[, replacer [, space [, options]]])`

Extend the content of an existing JSON file with the partial objects provided as argument.

Optionally take the same JSON formatting arguments than `#writeJSON()`.

Optionally pass an `options` object: the same `#write()` options, plus `options.json` to override the JSON handling for this single call — see [Custom JSON handling (JSONC)](#custom-json-handling-jsonc).

## Custom JSON handling (JSONC)

By default the JSON helpers use `JSON.parse` / `JSON.stringify`, so commented files like `tsconfig.json` (JSONC) can't be read, and comments and formatting are lost on every write. You can inject your own JSON handling via the editor options (`create(store, { json: { parse, stringify } })`, applies to every JSON helper) or on a single call.

Two contracts:

- `parse(text)` returns the parsed value of a JSON document. **It must throw on input it cannot parse** — the helpers report the failure instead of silently continuing with a partial value. Note that some parsers (e.g. jsonc-parser's `parse`) never throw on their own; wrap them and check their error output.
- `stringify(value, context)` returns the full text to write. The value comes first, matching `JSON.stringify`. The context provides:
  - `context.originalText`: the current text of the target file (pending in-memory changes included), `''` if the file exists but is empty, `undefined` if it doesn't exist (never created, or deleted). The text is passed through as-is: a leading BOM, if any, is included.
  - `context.original`: `originalText` parsed with the configured `parse` hook — no need to re-parse it in the hook. `undefined` when there is no original text or it failed to parse.
  - `context.replacer` / `context.space`: the `replacer` and `space` arguments of `writeJSON()`/`extendJSON()`, so a hook can honor them. The default (no hook) behavior of `JSON.stringify` including the trailing newline is unchanged.

This makes the hook patch-aware: with `context.originalText` available, an implementation can rewrite only what changed in the original document, keeping comments, key order and formatting intact. Its output is written as-is.

Here is a complete example using [jsonc-parser](https://github.com/microsoft/node-jsonc-parser) (a consumer-provided dependency — the library itself ships no JSON parser):

```js
import { create as createMemFs } from 'mem-fs';
import { create as createEditor } from 'mem-fs-editor';
import { applyEdits, modify, parse as parseJSONC } from 'jsonc-parser';

// jsonc-parser's parse() never throws; it collects errors and returns a
// partial value. The parse hook contract requires throwing on invalid input,
// so wrap it.
function parse(text) {
  const errors = [];
  const value = parseJSONC(text, errors);
  if (errors.length > 0) {
    throw new Error(`Invalid JSONC document (${errors.length} parse errors)`);
  }
  return value;
}

// Minimal diff between the new value and the parsed original, expressed as
// jsonc-parser edits.
function collectEdits(path, value, original) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    original === null ||
    typeof original !== 'object' ||
    Array.isArray(original)
  ) {
    return JSON.stringify(value) === JSON.stringify(original) ? [] : [[path, value]];
  }

  const edits = [];
  for (const [key, child] of Object.entries(value)) {
    edits.push(...collectEdits([...path, key], child, original[key]));
  }
  // writeJSON() means replace: keys of the original that are absent from
  // the new value are removed.
  for (const key of Object.keys(original)) {
    if (!(key in value)) {
      edits.push([[...path, key], undefined]);
    }
  }
  return edits;
}

const fs = createEditor(createMemFs(), {
  json: {
    parse,
    stringify(value, context) {
      if (
        context.originalText === undefined ||
        context.original === undefined ||
        context.originalText.trim() === ''
      ) {
        // New, empty or unparseable file: serialize from scratch.
        return `${JSON.stringify(value, context.replacer, context.space ?? 2)}\n`;
      }

      // Patch only what changed, keeping comments, key order and formatting.
      let text = context.originalText;
      for (const [path, editValue] of collectEdits([], value, context.original)) {
        text = applyEdits(
          text,
          modify(text, path, editValue, {
            formattingOptions: { insertSpaces: true, tabSize: 2 },
          }),
        );
      }
      return text;
    },
  },
});
```

With the editor created as above, the JSON helpers work on JSONC files:

```js
// Reads a tsconfig.json full of comments
const config = fs.readJSON('tsconfig.json');

// Patches it in place; comments and formatting are preserved
fs.extendJSON('tsconfig.json', { compilerOptions: { strict: true } });
```

> **Warning:** configuring only `parse` (without `stringify`) is a common first step ("I just want `readJSON` to stop throwing on tsconfig"), but `writeJSON()`/`extendJSON()` then fall back to `JSON.stringify` and **drop every comment** when they write. Configure both hooks together when editing JSONC files; `extendJSON()` logs a debug warning (enable with `DEBUG=mem-fs-editor:*`) when a custom `parse` runs without a custom `stringify`.

A `{ json: { parse, stringify } }` object can also be passed as the `json` option of `readJSON()`, `writeJSON()` and `extendJSON()` (their `options` argument) to override the editor-level handling for a single call.

The library itself ships no JSON parser: the hooks are always user-provided, so your dependency tree stays unchanged.

### `#delete(filepath, [options])`

Delete a file or a directory.

`filePath` can also be a `glob`. If `filePath` is glob, you can optionally pass in an `options.globOptions` object to change its pattern matching behavior. The full list of options are being described [here](https://github.com/mrmlnc/fast-glob#options-1). The `sync` flag is forced to be `true` in `globOptions`.

### `#copy(from, to, [options])`

Copy file(s) from the `from` path to the `to` path.
When passing array, you should pass `options.fromBasePath` to be used to calculate the `to` relative path. The common directory will be detected and used as `fromBasePath` otherwise.

Optionally, pass an `options.fileTransform` function that transforms both the destination path and file contents. The function receives a single object parameter with the following properties:

- `destinationPath`: The resolved destination file path (string)
- `sourcePath`: The source file path (string)
- `contents`: The file contents as a `Buffer`
- `data`: Optional data passed via `options.transformData`
- `options`: Optional options passed via `options.transformOptions`

The function should return an object `{ path, contents }` where:

- `path`: The transformed destination path (string)
- `contents`: The transformed file contents (string | Buffer)

Example:

```js
fs.copy('source.txt', 'dest.txt', {
  fileTransform({ destinationPath, sourcePath, contents, data, options }) {
    const newPath = destinationPath.replace('.txt', '.md');
    const newContents = contents.toString().toUpperCase();
    return { path: newPath, contents: newContents };
  },
});
```

`options.ignoreNoMatch` can be used to silence the error thrown if no files match the `from` pattern.
`options.append` can be used to append `from` contents to `to` instead of copying, when the file is already loaded in mem-fs (safe for regeneration).
`options.metadata` can be used to attach an arbitrary object to the copied file as `editorMetadata`. When omitted, the source file's `editorMetadata` (if any) is carried forward to the copy. See [File metadata](#file-metadata).

`from` can be a glob pattern that'll be match against the file system. If that's the case, then `to` must be an output directory. For a globified `from`, you can optionally pass in an `options.globOptions` object to change its pattern matching behavior. The full list of options are being described [here](https://github.com/mrmlnc/fast-glob#options-1). The `nodir` flag is forced to be `true` in `globOptions` to ensure a vinyl object representing each matching directory is marked as `deleted` in the `mem-fs` store.

`options.noGlob` can be used to by bypass glob matching entirely. In that case, `from` will directly match file paths against the file system.

### `#copyAsync(from, to, [options])`

Async version of `copy`.

`copy` loads `from` to memory and copy its contents to `to`.
`copyAsync` copies directly from the disk to `to`, falling back to `copy` behavior if the file doesn't exists on disk.

Same parameters of `copy`. The `fileTransform` function can also return a `Promise<{ path: string; contents: string | Buffer }>` for async transformations.

See [copy() documentation for more details](#copyfrom-to-options).

### `#copyTpl(from, to, data[, options])`

Copy the `from` file and, if it is not a binary file, parse its content as an [ejs](http://ejs.co/) template where `data` is the template context (the variable names available inside the template).

`options.transformOptions` replaced the old `tplOptions` parameter and is passed as ejs options. `mem-fs-editor` automatically setup the filename option so you can easily use partials.

You can also optionally pass a `options` object (see [copy() documentation for more details](#copyfrom-to-options)).

Templates syntax looks like this:

```
<%= value %>
<%- include('partial.ejs', { name: 'Simon' }) %>
```

Dir syntax looks like this:

```
/some/path/dir<%= value %>/...
```

Refer to the [ejs documentation](http://ejs.co/) for more details.

### `#copyTplAsync(from, to, data[, options])`

Async version of `copyTpl` that uses `copyAsync` instead of `copy`.

Can be used for best performance. Reduces overheads.

Same parameters of `copyTpl` (see [copyTpl() documentation for more details](#copytplfrom-to-data-options)).

### `#move(from, to, [options])`

Move/rename a file from the `from` path to the `to` path.

`#move` internally uses `#copy` and `#delete`, so `from` can be a glob pattern, and you can provide `options.globOptions` with it. `options.metadata` is passed through to the copy (see [File metadata](#file-metadata)).

### `#exists(filepath)`

Returns `true` if a file exists. Returns `false` if the file is not found or deleted.

### `#commit([options,] [...transforms])`

Pass stored files through a pipeline and persist every changes made to files in the mem-fs store to disk.

If provided, `options` is the pipeline options.
By default only modified files are passed through the pipeline.
Pass a custom filter `options.filter` to customize files passed through the pipeline.
If provided, `...transforms` is a vararg of TransformStream to be applied on a stream of vinyl files (like gulp plugins).
`commitTransform` is appended to `transforms` and persists modified files to disk, non modified files are passed through.

Each file passed through the pipeline carries its `editorMetadata` (if any), so transforms can read it to drive content processing. See [File metadata](#file-metadata).

returns promise that is resolved once the pipeline is finished.

## File metadata

Editor actions that create or copy files (`write`, `writeJSON`, `extendJSON`, `append`, `appendTpl`, `copy`, `copyAsync`, `copyTpl`, `copyTplAsync`, `move`) accept an optional `metadata` option. The object is attached to the underlying mem-fs Vinyl file as `editorMetadata` and remains available during `store.each()`, `store.all()`, and commit transforms.

```js
import { Duplex } from 'node:stream';

fs.write('src/app.js', sourceContent, {
  metadata: {
    cleanupMarks: true,
  },
});

await fs.commit(
  Duplex.from(async function* (generator) {
    for await (const file of generator) {
      if (file.contents && file.editorMetadata?.cleanupMarks) {
        file.contents = cleanupMarks(file.contents);
      }

      yield file;
    }
  }),
);
```

When copying, an explicit `metadata` option overrides the source file's metadata; when omitted, the source file's `editorMetadata` (if any) is carried forward to the copy.

When a file already in memory is written again, the new `metadata` is merged over its existing `editorMetadata` (a shallow merge), so metadata attached by previous actions is kept; set a key to `undefined` to clear it. When omitted, the existing `editorMetadata` is kept.

When metadata is not provided, behavior is unchanged and no `editorMetadata` is set.

### `#dump([cwd,] [filter])`

Dump files to compare expected result.
Provide a `cwd` for relative path. Allows to omit temporary path.
Provide a `filter` function or a pattern to focus on specific files.
`dump` returns only modified (committed or not) files when no filter or a pattern is provided.
