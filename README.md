# mem-fs

In-memory file storage and editing utilities for code generators and project scaffolding tools.

This repository publishes two packages:

- [`mem-fs`](./packages/mem-fs/README.md): a vinyl-backed in-memory file store.
- [`mem-fs-editor`](./packages/mem-fs-editor/README.md): high-level read, write, copy, template, and commit helpers built on top of `mem-fs`.

## Install

```sh
npm install mem-fs mem-fs-editor
```

## Usage

```js
import { create as createStore } from 'mem-fs';
import { create as createEditor } from 'mem-fs-editor';

const store = createStore();
const editor = createEditor(store);

editor.write('package.json', JSON.stringify({ type: 'module' }, null, 2));
editor.copyTpl('templates/index.js.ejs', 'src/index.js', {
  name: 'my-app',
});

await editor.commit();
```

`mem-fs` tracks file objects in memory. `mem-fs-editor` mutates that store and commits pending changes to disk when `commit()` runs.
