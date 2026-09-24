# Building a Lightfern plugin

This is the complete contract for an **in-folder plugin**: a small app that lives as a folder in
your Lightfern library and is built by Lightfern itself, with no toolchain on your side. Read it
before you create or edit a plugin, and start from the
[reference plugin](../examples/recruiting-ats/) rather than inventing structure. Lightfern's
built-in assistant writes plugins against this same contract, so what you learn here is what it
follows.

Companion documents:

- [Styling](styling.md): the `--lf-*` design tokens and the CSS recipes that make a view look like
  part of the app.
- [The sandbox](sandbox.md): what a view can and cannot do inside its iframe, including network
  requests, keyboard shortcuts and text selection.
- [Reference plugin](example.md): a walkthrough of the Recruiting ATS example.
- [Versioning](versioning.md): how `manifestVersion` and this repository's tags relate.

## What a plugin is

A plugin is a small **app** that lives as a folder in the library. It contributes UI in two ways,
and can use either or both:

- A **home view**: the UI that opens when you click the plugin in the library. Think dashboard,
  tool, or custom workspace: something you open and use, not just a file.
- **File views**: custom UIs that replace the default viewer for particular files you already have
  (a `.csv` that renders as an editable table, a note that renders as a checklist).

Most plugins center on a home view, but a plugin that only contributes file views (a CSV viewer,
say) is just as valid.

An in-folder plugin is just source files in a folder in the library: a `manifest.json`, some
`.tsx`/`.ts`, and an optional `styles.css`. There is **no** `package.json`, `node_modules`, bundler
config, or compiled output. The source files are the artifact. Lightfern transpiles and bundles them
in-process on save.

## How you build one

A plugin is any folder that holds a `manifest.json`. Drop that folder anywhere in the library and it
becomes a plugin: clicking it opens its home view, and any file views it declares apply to the files
that sit alongside it, in the folder the plugin lives in and its subfolders.

**Name the folder for people.** The plugin's folder name is the label shown in the library, so give
it a real name: `Recruiting ATS`, not `recruiting-ats`. The manifest's `id` stays a stable slug for
the host; the folder name (and the manifest `name`) are the human-facing labels.

Your library is a folder on disk. Create the plugin folder and its files there however you like:
from inside Lightfern, with any editor pointed at the library folder, or by asking Lightfern's
assistant to write them. Concretely:

1. Create the plugin folder and its files (`manifest.json`, `src/…`) in the library.
2. Lightfern builds on save. Click the plugin to see its home view; open a matching file to see a
   file view.
3. Iterate: edit a file, the view hot-reloads. If it does not compile, the view slot shows a
   structured build error (file, line, column, message). Read it, fix the file, re-save.

## The manifest

```json
{
  "manifestVersion": 2,
  "id": "recruiting-ats",
  "name": "Recruiting ATS",
  "version": "1.0.0",
  "dependencies": { "react": "19.2.0", "react-dom": "19.2.0" },
  "permissions": ["files.read", "files.write"],
  "contributes": {
    "home": { "entry": "src/home.tsx" },
    "views": [{ "match": "candidates/*.md", "entry": "src/candidate.tsx" }]
  }
}
```

- `manifestVersion`: required, `2` for a new plugin. Names the plugin contract this manifest is
  written against: the manifest schema, the `ctx`/RPC/event host API, the `lightfern:host` imports,
  and the `--lf-*` theme tokens. Lightfern refuses a version it doesn't support and shows an error
  in the plugin's view instead of running it. See [Versioning](versioning.md).
- `id`, `name`, `version`: a URL-safe slug of lowercase letters, digits, `.` and `-`
  (`recruiting-ats`, `com.acme.ats`) that is **unique across every plugin in the library** (two
  plugins sharing an `id` serve one bundle), a human-readable name, and a semver string (display
  metadata only, for an in-folder plugin).
- `dependencies`: optional browser packages, keyed by package name with an **exact** version.
  Lightfern downloads and caches their esm.sh browser modules before serving them from the local
  plugin origin; a view never executes a remote script. Declare `react` and `react-dom` when using
  React/TSX. Peer dependencies must be declared too.
- `permissions`: the file capabilities the plugin uses: `files.read`, `files.write`. Declare exactly
  what the views call; using an undeclared capability fails.
- `network_permissions`: optional; allowed network origins, empty by default. An entry is an
  `https://` origin, optionally with a `*.` subdomain wildcard: `https://api.example.com`,
  `https://*.example.com` (matches subdomains only, not `example.com` itself). No paths, no
  `http://`, no `ws(s)://`. A declared origin can serve fetch/XHR data and non-code image, font, and
  media assets; it never permits remote JavaScript or workers.
- `contributes.home`: the plugin's home view (see below). Optional, but it's the usual reason to
  build a plugin.
- `contributes.views`: file views (see **File views**). Optional; omit it for a home-only app.

The schema is enforced by the host and is exported from this package as `manifestSchema` (zod), with
`parseManifest`, `safeParseManifest` and `formatManifestErrors` alongside it.

## Home views

The home view is the plugin as an app: the UI that opens when you click the plugin's own node in the
library (the folder that holds its `manifest.json`). Use it for a home screen, dashboard, tool, or
settings: anything that is about the plugin itself rather than one file next to it. Most plugins are
built for their home view; file views are the add-on.

Declare it as `contributes.home`. It has **no `match`**: it is bound to the plugin's own folder,
which the manifest can't name anyway. That is wherever the plugin folder is dropped in the library,
not something the author writes down.

| Field   | Required | Meaning                                                  |
| ------- | -------- | -------------------------------------------------------- |
| `entry` | yes      | The source module Lightfern builds, e.g. `src/home.tsx`. |
| `title` | no       | Label for the view; defaults to the plugin's `name`.     |

```json
"contributes": {
  "home": { "entry": "src/home.tsx" }
}
```

A home-only app declares just `home` and omits `views` entirely. The view is written exactly like
any other (`connect`, `createRoot`, the same `ctx`).

**Where a home view reads and writes.** A plugin works with the files around it: everything in the
folder it lives in and below (paths are relative to that folder; `""` is the folder itself).
`ctx.path` is the plugin's own folder within it, so `ctx.files.list("")` enumerates the surrounding
folder, `ctx.files.list(ctx.path)` enumerates the plugin's own files, and `ctx.open(...)` navigates
anywhere in range. A plugin without a `home` is inert to clicks: selecting its node just selects it.

Because a home-only plugin claims no `views`, files beside it still open in Lightfern's own viewer
when clicked; the home view only renders them when the plugin's own node is opened. Two home-only
plugins can sit in the same folder and each present the shared files their own way.

## File views

A file view replaces the default viewer for particular files. Each entry has:

| Field   | Required | Meaning                                                       |
| ------- | -------- | ------------------------------------------------------------- |
| `match` | yes      | Path pattern for the files it opens.                          |
| `entry` | yes      | The source module Lightfern builds, e.g. `src/candidate.tsx`. |
| `title` | no       | Label for the view; defaults to the opened file's name.       |

Patterns are matched against file paths in the folder the plugin lives in and its subfolders; they
cannot reach siblings or parents of that folder. A pattern only ever names files; a trailing `/` is
rejected. Folders don't open views; a plugin's own folder opens its `home`.

- `*`: zero or more characters within one segment (never matches `/`).
- `?`: exactly one character within one segment.
- `**`: zero or more whole path segments (only as a complete segment).

| Pattern              | Matches                                             |
| -------------------- | --------------------------------------------------- |
| `*.md`               | markdown files directly in the folder               |
| `**/*.md`            | markdown files at any depth                         |
| `candidates/*.md`    | markdown files directly inside `candidates/`        |
| `**/candidates/*.md` | markdown files inside any folder named `candidates` |

Prefer one view whose pattern covers every file it should open (`"*.md"`) over one view per file.
Several views may point at the same `entry`; they are one mounted view either way.

The matcher is exported from this package as `matchesPattern` (`@lightfern/plugin-sdk/match`) so
tooling can evaluate patterns exactly as the host does.

## Writing a view

Lightfern owns the iframe document: it injects the import map, links `styles.css`, and provides an
empty `<div id="root">`. Your entry module connects to the host and mounts. That document is a
**sandboxed** iframe; read [The sandbox](sandbox.md) before you reach for a browser API.

**Imports come from exactly two places:**

- **Relative** imports (`./helpers`) resolve within the plugin folder.
- **Bare** imports resolve through the host-injected import map. Nothing is installed, and nothing
  else is importable:

  | Import                 | What it is                                                                                                                         |
  | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
  | `lightfern:host`       | The plugin SDK: `connect()` and its types. Needs no dependencies.                                                                  |
  | `lightfern:host/react` | React bindings: `usePath()`, `useFile()`, `useFileObjectUrl()`, and `useCurrentUser()`. Requires `react` in `dependencies`.        |
  | A declared dependency  | A locally served esm.sh browser module. `react` also serves `react/jsx-runtime`; declaring `react-dom` permits `react-dom/client`. |

  Declare every bare package import in `dependencies`, including React peer dependencies. Lightfern
  serves only its local cached output to the frame; a CDN `<script>` and `import` from a URL remain
  unavailable. A package which does not produce a self-contained browser module fails to prepare
  with a build error rather than causing a remote script fetch.

**All data access goes through `ctx.files`.** There is no `fetch` to undeclared origins, no direct
filesystem, no reach beyond the folder the plugin lives in. Every path is relative to that folder
(`""` is the folder itself):

- `ctx.files.read(path, encoding?)` → `string | Uint8Array`: reads the file at `path`. `encoding` is
  `"utf-8"` (default → text) or `"binary"` (→ raw bytes). Binary files (images, PDFs) **must** use
  `"binary"`; the default text decode corrupts them. Requires `files.read`. To show a library image,
  prefer the `useFileObjectUrl` binding below over decoding bytes yourself.
- `ctx.files.write(path, content, options?)` → `void`: creates the file (and any missing parent
  folders) at `path`. `content` is `string | Uint8Array`: a string is written as UTF-8 text; binary
  content (an image, a PDF) **must** be a `Uint8Array` of its raw bytes, never a decoded string, or
  the bytes are corrupted. By default (`overwrite: false`) a path already taken by a file rejects;
  pass `{ overwrite: true }` to replace its contents. Requires `files.write`.
- `ctx.files.list(path)` → `FileEntry[]` where `FileEntry` is `{ path, name, kind }` and `kind` is
  `"file" | "folder"`. Requires `files.read`.
- `ctx.files.move(from, to)` → `void`: moves or renames a node (a rename is a move within the same
  folder). Creates missing parent folders of `to`; rejects if `to` is already taken by a different
  node. Requires `files.write`.
- `ctx.files.delete(path)` → `void`: deletes a file or folder (folders go with their contents);
  deleting a missing path is a no-op. Requires `files.write`.
- `ctx.files.watch(path, listener)` → `() => void`: calls `listener` with a `FileChange` each time a
  node the `path` covers changes on disk. Returns an unsubscribe. See **Staying in sync**. Requires
  `files.read`.

**Keep code and data separate.** A plugin can never write into its own folder; such writes are
rejected. Write data the plugin produces to the surrounding folder or a subfolder of it, alongside
the files already kept there. Don't treat the plugin folder as a private data store.

`ctx.path` is the opened node's path relative to the folder the plugin lives in: the plugin's own
folder for a home view, the opened file for a file view. `ctx.homePath` is the plugin's own folder
(where its `manifest.json` sits) relative to that same root. It never moves as `ctx.path` does, so a
file view can reach its home without hardcoding the folder name. `ctx.pluginId` is also available.

`ctx.currentUser` is the signed-in Lightfern user, or `null` when signed out. It has `id`, `email`,
`name` (nullable), and `profilePictureUrl` (nullable). Use the stable `id` for ownership in shared
data such as a game leaderboard, and `name` or `profilePictureUrl` for display. The value updates
when desktop sign-in state changes; subscribe with `ctx.onCurrentUserChange(listener)` or use
`useCurrentUser()` in React if the view needs to react while it stays open. This identity is public
to the plugin and is not an authentication credential. Rendering a remote `profilePictureUrl`
requires its origin in the plugin's `network_permissions`.

`ctx.open(path, newTab?)` → `void` opens another node exactly as a click in the library would:
routing to a file's view, opening a plugin's `home` view for its own folder, or revealing an
ordinary folder in the tree. The path may not reach beyond the folder the plugin lives in;
`newTab: true` opens beside the current tab. Needs no permission. A file view returns to its home
with `ctx.open(ctx.homePath)`.

The full `ViewContext` and `FilesApi` types, with their documentation comments, live in
[`src/context.ts`](../src/context.ts).

### Staying in sync

A view is long-lived: the user navigates to another node it matches (the iframe does not reload;
module state and transitions survive), and the files under it change on disk. A view that reads once
in a `useEffect([])` goes stale on both.

**The React bindings handle both.** `usePath()` turns navigation into state; `useFile(path)` reads
that file and re-reads it on every disk change, dropping the old watch when the path moves:

```tsx
import { useFile, usePath } from "lightfern:host/react";

const path = usePath();
const text = useFile(path); // null until the first read lands — never the file you just left
```

Write with `ctx.files.write`: your own write comes back as a disk change, so the view re-renders
from disk.

**Images and other binary files** use `useFileObjectUrl(path)` instead. It reads the bytes with
`read(path, "binary")`, hands you an object URL for an `<img>` (or any URL sink), and revokes it
when the path changes or the file is replaced, so a long-lived view doesn't leak URLs:

```tsx
import { useFileObjectUrl } from "lightfern:host/react";

const src = useFileObjectUrl("cover.png"); // null until the first read lands
return src && <img src={src} alt="" />;
```

The frame's Content-Security-Policy allows `<img>` from the plugin's own bundled assets, `data:`,
and `blob:`. An object URL is a `blob:`, so it renders; a remote image URL is blocked.

**Saving a remote image to the library**: `fetch` its bytes from an origin you declared in
`network_permissions`, then write the `Uint8Array` (not a decoded string):

```ts
const res = await fetch("https://cdn.example.com/cover.png");
await ctx.files.write("cover.png", new Uint8Array(await res.arrayBuffer()));
```

Underneath are `ctx.path` (live), `ctx.onPathChange(next => …)` and
`ctx.files.watch(path, listener)`. Reach for those when the bindings do not fit, e.g. a view that
must do something other than re-read. A watcher is pinned to the path you pass, so re-register it
when the path moves.

`watch` filters by that path: a **file** path fires only for that file, a **folder** path (or `""`,
the folder the plugin lives in) for anything in its subtree: a child added/removed/renamed, or a
descendant's content changing. The listener gets the change:

```ts
type FileChange = { type: "created" | "changed" | "deleted"; path: string };
```

A move arrives as a `deleted` plus a `created`. Your own writes come back as `changed`, so
re-reading in the listener is safe; writing back unconditionally loops.

A home view that lists files can watch the whole folder and react to just the node that changed:
re-list on structure, re-read one file on content:

```tsx
useEffect(() => {
  void refreshIndex();
  return ctx.files.watch("", (change) => {
    if (change.type === "changed") void refreshItem(change.path);
    else void refreshIndex(); // created / deleted → the set of files moved
  });
}, []);
```

### Styling

Styling is a plain `styles.css` at the plugin root, linked into the view document by convention.
Lightfern serves its own design tokens into the frame as `--lf-*` CSS variables, and Geist is
already applied to `body`, so a view built from those tokens reads as part of the app and follows
dark mode for free. Do **not** use Tailwind classes: there is no Tailwind in the plugin frame, so
they render unstyled. Write real CSS. The token table and the recipes for cards, controls, hover
washes and elevation are in [Styling](styling.md).

**TypeScript and JSX just work.** Lightfern bundles the import graph on save. You never run a
compiler.

## What is not available in-folder

- **npm installation or arbitrary URLs.** Use exact versions in `dependencies`; do not add a
  `package.json`, lockfile, CDN script tag, or URL import. Lightfern owns package preparation and
  caching so the running frame stays local-only.
- **Custom build config** (Vite, tsconfig). The build is fixed and unconfigurable.
- **Browser capabilities the sandbox does not grant.** See [The sandbox](sandbox.md) for the exact
  iframe attributes and what they imply (no `<form>` submission, no native dialogs, CORS applies to
  every request).

## Reference plugin

[`examples/recruiting-ats/`](../examples/recruiting-ats/) is a complete plugin that shows the whole
runtime shape in two views: connect, mount, enumerate a folder, read each file, follow disk changes,
navigate, and write a file back. Copy it into your library as `Recruiting ATS` (the folder name is
what the library shows) and it runs as-is. [Reference plugin](example.md) walks through it.
