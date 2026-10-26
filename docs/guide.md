# Building a Lightfern app

This is the complete contract for a Lightfern **app**: a small app that lives as a folder in your
Lightfern library and is built by Lightfern itself, with no toolchain on your side. Read it before
you create or edit an app, and start from the [reference app](../examples/recruiting-ats/) rather
than inventing structure. Lightfern's built-in assistant writes apps against this same contract, so
what you learn here is what it follows. (This package and some of its names still say "plugin"; a
plugin is an app's code.)

Companion documents:

- [Styling](styling.md): when a view should look like part of Lightfern and when it should have its
  own look, the `--lf-*` design tokens, and CSS recipes for both.
- [The sandbox](sandbox.md): what a view can and cannot do inside its iframe, including network
  requests, screen wake lock, background workers, keyboard shortcuts and text selection.
- [Multiplayer](multiplayer.md): live presence between everyone using a shared app, and how it works
  alongside the files they share.
- [Reference app](example.md): a walkthrough of the Recruiting ATS example.

## What an app is

An app lives as a folder in the library. It contributes UI in two ways, and can use either or both:

- A **home view**: the UI that opens when you click the app in the library. Think dashboard, tool,
  or custom workspace: something you open and use, not just a file.
- **File views**: custom UIs that replace the default viewer for particular files you already have
  (a `.csv` that renders as an editable table, a note that renders as a checklist).

Most apps center on a home view, but an app that only contributes file views (a CSV viewer, say) is
just as valid.

An app is made of two folders:

- The **app folder** is what the library shows. It holds the files the app works on.
- The **code folder** sits inside the app folder. It holds `manifest.json`, some `.tsx`/`.ts`, and
  an optional `styles.css`.

There is **no** `package.json`, `node_modules`, bundler config, or compiled output. The source files
are the artifact. Lightfern transpiles and bundles them in-process on save.

## How you build one

Any folder that holds a `manifest.json` is a code folder, and the folder that holds it is its app
folder. The app works on the files in its app folder, and any file views it declares apply to the
files there and in its subfolders. An app always looks like this:

```
Recruiting/              ← the app folder: the library shows this name, and the app's data lives here
├── candidates/
│   └── ada.md
└── code/                ← the code folder
    ├── manifest.json
    ├── styles.css
    └── src/
        └── home.tsx
```

So the code folder always goes **inside** an app folder:

- **For a new app,** create the app folder first, named for people (`Habit Tracker`), then create
  the code folder inside it (`Habit Tracker/code`). Write the app's data into the app folder, never
  into the code folder.
- **For an app over files someone already has,** put the code folder in the folder the app works on,
  beside the files and folders it uses: `Hiring/code` next to `Hiring/candidates`, or `Finance/code`
  for CSVs in `Finance/2025`.

The code folder can have any name; `code` is just the convention for new apps. An existing app is
already laid out this way, so don't rename or move its code folder.

Never put `manifest.json` directly in a folder at the top of the library, such as
`Habit Tracker/manifest.json`. That folder is then the code folder with no app folder around it, so
the app works on the whole library.

The library shows an app as one row. Clicking it opens the home view. The app's files stay hidden
until the user chooses "Show contents", and the code folder shows as one more row with a code icon.
The code folder can't be moved out of its app folder, so moving the app keeps its code and data
together.

**Name the app folder for people.** The library and the home view's tab show its name, so give it a
real name: `Recruiting`, not `recruiting-data`. The manifest's `id` stays a stable slug for the
host.

A few rules keep apps predictable and safe:

- An app folder runs one app. If it holds more than one code folder, only the first alphabetically
  runs, and the others say the folder already has an app.
- A code folder at the top of the library has no app folder. It shows as its own row and works on
  the whole library.
- A code folder never runs at the top of a shared folder, because there it could read the folder
  each member places the share in. Lightfern won't share a code folder on its own, and won't put a
  `manifest.json` at the top of a shared folder. Share the app folder instead.

Your library is a folder on disk. Create the app's folders and files there however you like: from
inside Lightfern, with any editor pointed at the library folder, or by asking Lightfern's assistant
to write them. Concretely:

1. Create the app folder, then the code folder inside it with its files (`manifest.json`, `src/…`).
2. Lightfern builds on save. Click the app to see its home view; open a matching file to see a file
   view.
3. Iterate: edit a file, the view hot-reloads. If it does not compile, the view slot shows a
   structured build error (file, line, column, message). Read it, fix the file, re-save.

## The manifest

```json
{
  "manifestVersion": "2.1",
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

- `manifestVersion`: required. This is the SDK version your app is built against, and it covers the
  manifest format, the `ctx` API, the `lightfern:host` imports, and the `--lf-*` theme tokens. Use
  the latest major, with the earliest minor that has everything your app uses.
- `id`, `name`, `version`: a URL-safe slug of lowercase letters, digits, `.` and `-`
  (`recruiting-ats`, `com.acme.ats`) that is **unique across every app in the library** (two apps
  sharing an `id` serve one bundle), a human-readable name, and a semver string (display metadata
  only).
- `dependencies`: optional browser packages, keyed by package name with an **exact** version.
  Lightfern downloads and caches their esm.sh browser modules before serving them from the app's
  local origin; dependencies are not loaded from remote script URLs. Declare `react` and `react-dom`
  when using React/TSX. Each declared package loads once per view, and its subpaths share that copy.
  A package's required peer dependencies must be declared too.
- `permissions`: optional; the capabilities the app uses, empty by default: `files.read`,
  `files.write`, `multiplayer` (see [Multiplayer](multiplayer.md)), `camera` and `microphone` (see
  [Camera and microphone](sandbox.md#camera-and-microphone)). Declare exactly what the views call;
  using an undeclared capability fails.
- `network_permissions`: optional; allowed network origins, empty by default. An entry is an
  `https://` origin, optionally with a `*.` subdomain wildcard: `https://api.example.com`,
  `https://*.example.com` (matches subdomains only, not `example.com` itself). No paths, no
  `http://`, no `ws(s)://`. A declared origin can serve fetch/XHR data and non-code image, font, and
  media assets. It does not permit remote JavaScript or worker URLs. A view can run code from a blob
  worker, so never turn fetched content into worker code; see
  [The sandbox](sandbox.md#background-workers).
- `contributes.home`: the app's home view (see below). Optional, but it's the usual reason to build
  an app.
- `contributes.views`: file views (see **File views**). Optional; omit it for a home-only app.

The schema is enforced by the host and is exported from this package as `manifestSchema` (zod), with
`parseManifest`, `safeParseManifest` and `formatManifestErrors` alongside it.

## Home views

The home view is the app itself: the UI that opens when you click the app in the library. Use it for
a home screen, dashboard, tool, or settings: anything that is about the app rather than one file in
it. Most apps are built for their home view; file views are the add-on.

Declare it as `contributes.home`. It has **no `match`**: it is bound to the app, which the manifest
can't name anyway. That is wherever the app folder sits in the library, not something the author
writes down.

| Field   | Required | Meaning                                                         |
| ------- | -------- | --------------------------------------------------------------- |
| `entry` | yes      | The source module, relative to the code folder: `src/home.tsx`. |
| `title` | no       | Label for the view; defaults to the app folder's name.          |

```json
"contributes": {
  "home": { "entry": "src/home.tsx" }
}
```

A home-only app declares just `home` and omits `views` entirely. The view is written exactly like
any other (`connect`, `createRoot`, the same `ctx`).

**Where a home view reads and writes.** An app works with the files in its app folder and below
(paths are relative to the app folder; `""` is the app folder itself). `ctx.path` is the code folder
within it, so `ctx.files.list("")` enumerates the app folder, `ctx.files.list(ctx.path)` enumerates
the app's own code, and `ctx.open(...)` navigates anywhere in range. An app without a `home` has
nothing to open, so its app folder shows as a plain folder.

Because a home-only app claims no `views`, its files still open in Lightfern's own viewer when
clicked; the home view only renders them when the app is opened. To present the same files in two
ways, give each app a folder of its own.

## File views

A file view replaces the default viewer for particular files. Each entry has:

| Field   | Required | Meaning                                                       |
| ------- | -------- | ------------------------------------------------------------- |
| `match` | yes      | Path pattern for the files it opens.                          |
| `entry` | yes      | The source module Lightfern builds, e.g. `src/candidate.tsx`. |
| `title` | no       | Label for the view; defaults to the opened file's name.       |

Patterns are matched against file paths in the app folder and its subfolders; they cannot reach
siblings or parents of that folder. A pattern only ever names files; a trailing `/` is rejected.
Folders don't open views; clicking the app opens its `home`.

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

- **Relative** imports (`./helpers`) resolve within the code folder.
- **Bare** imports resolve through the host-injected import map. Nothing is installed, and nothing
  else is importable:

  | Import                 | What it is                                                                                                                                                                                                                             |
  | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `lightfern:host`       | The app SDK: `connect()` and its types. Needs no dependencies.                                                                                                                                                                         |
  | `lightfern:host/react` | React bindings: `usePath()`, `useFile()`, `useFolder()`, `useFileObjectUrl()`, `useCurrentUser()`, `useFileId()`, `useConnected()`, `usePeers()`, `useMe()`, `useViewId()` and `useSetPresence()`. Requires `react` in `dependencies`. |
  | A declared dependency  | A locally served esm.sh browser module. `react` also serves `react/jsx-runtime`; declaring `react-dom` permits `react-dom/client`.                                                                                                     |

  Declare every bare package import in `dependencies`, including the peer dependencies of the
  packages you use. A subpath of a declared package uses the same instance as the package, so
  three.js add-ons work with the app's own `three`:

  ```json
  "dependencies": { "three": "0.170.0" }
  ```

  ```ts
  import * as THREE from "three";
  import { OrbitControls } from "three/addons/controls/OrbitControls.js";
  ```

  Lightfern serves only its local cached output to the frame; a CDN `<script>` and `import` from a
  URL remain unavailable. A package which does not produce a self-contained browser module fails to
  prepare with a build error rather than causing a remote script fetch.

**All data access goes through `ctx.files`.** There is no `fetch` to undeclared origins, no direct
filesystem, no reach beyond the app folder. Every path is relative to the app folder (`""` is the
folder itself):

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

**Keep code and data separate.** An app can never write into its code folder; such writes are
rejected. Write data the app produces to the app folder or a subfolder of it, alongside the files
already kept there. Don't treat the code folder as a private data store.

**Save data files as compact JSON.** When your view writes its data to a `.json` file, serialize it
with `JSON.stringify(data)` without the `space` argument. Indented JSON wastes disk space and costs
many more tokens to read. This applies only to the data a view writes at runtime. Keep
`manifest.json` indented, since people read and edit it by hand.

`ctx.path` is the opened node's path relative to the app folder: the code folder for a home view,
the opened file for a file view. So give data paths relative to the app folder, like
`candidates/ada.md`, and never build them from `ctx.path` in a home view, which points into the
code. `ctx.homePath` is the code folder (where `manifest.json` sits) relative to that same root. It
never moves as `ctx.path` does, so a file view can reach its home without hardcoding the folder
name. `ctx.pluginId` is also available.

`ctx.currentUser` is the signed-in Lightfern user, or `null` when signed out. It has `id`, `email`,
`name` (nullable), and `profilePictureUrl` (nullable). Use the stable `id` for ownership in shared
data such as a game leaderboard, and `name` or `profilePictureUrl` for display. The value updates
when desktop sign-in state changes; subscribe with `ctx.onCurrentUserChange(listener)` or use
`useCurrentUser()` in React if the view needs to react while it stays open. This identity is public
to the app and is not an authentication credential. Rendering a remote `profilePictureUrl` requires
its origin in the app's `network_permissions`.

`ctx.open(path, newTab?)` → `void` opens another node exactly as a click in the library would:
routing to a file's view, opening the home view when `path` is `ctx.homePath`, or revealing an
ordinary folder in the tree. The path may not reach beyond the app folder; `newTab: true` opens
beside the current tab. Needs no permission. A file view returns to its home with
`ctx.open(ctx.homePath)`.

`ctx.fileId` is the opened node's file ID: the same for everyone with access to the file, and kept
through renames and moves. A new file's ID can change once, when it first syncs; `onPathChange` (or
`useFileId()`) tells you when it does. It is `null` only where there is no library, like the public
share viewer.

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

`useFolder(path)` lists the folder's immediate files and subfolders as `FileEntry[]`, or `null`
until the first listing lands. It re-lists when an immediate entry is created, deleted, or renamed;
changes to file contents do not change the listing. Like `useFile`, it drops the previous folder's
entries when `path` changes. Apps using it should declare `"manifestVersion": "2.2"`:

```tsx
import { useFolder } from "lightfern:host/react";

const entries = useFolder("candidates");
return entries?.map((entry) => <div key={entry.path}>{entry.name}</div>);
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

The frame's Content-Security-Policy allows `<img>` from the app's own bundled assets, `data:`, and
`blob:`. An object URL is a `blob:`, so it renders; a remote image URL is blocked.

**Saving a remote image to the library**: `fetch` its bytes from an origin you declared in
`network_permissions`, then write the `Uint8Array` (not a decoded string):

```ts
const res = await fetch("https://cdn.example.com/cover.png");
await ctx.files.write("cover.png", new Uint8Array(await res.arrayBuffer()));
```

Underneath are `ctx.path` (live), `ctx.onPathChange(next => …)` and
`ctx.files.watch(path, listener)`. Reach for those when the bindings do not fit, e.g. a view that
must read each listed file's contents as in the reference app. A watcher is pinned to the path you
pass, so re-register it when the path moves.

`watch` filters by that path: a **file** path fires only for that file, a **folder** path (or `""`,
the app folder) for anything in its subtree: a child added/removed/renamed, or a descendant's
content changing. The listener gets the change:

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

Styling is a plain `styles.css` at the top of the code folder, linked into the view document by
convention. Do **not** use Tailwind classes: there is no Tailwind in the app's frame, so they render
unstyled. Write real CSS.

Decide first whether the view should look like Lightfern or like its subject. A tool for working
with files (a tracker, a dashboard, a form) should match Lightfern: Lightfern serves its design
tokens into the frame as `--lf-*` CSS variables, and a view built from them reads as part of
Lightfern and follows dark mode for free. A view whose look is part of its content (a D&D map, a
game board, an invoice or slide deck, a client's brand, a photo gallery) should get its own.
[Styling](styling.md) covers how to choose, the token table, the recipes for cards, controls, hover
washes and elevation, and how to build a look of your own.

**TypeScript and JSX just work.** Lightfern bundles the import graph on save. You never run a
compiler.

## What is not available

- **npm installation or arbitrary URLs.** Use exact versions in `dependencies`; do not add a
  `package.json`, lockfile, CDN script tag, or URL import. Lightfern owns package preparation and
  caching so the running frame stays local-only.
- **Custom build config** (Vite, tsconfig). The build is fixed and unconfigurable.
- **Browser capabilities the sandbox does not grant.** See [The sandbox](sandbox.md) for the exact
  iframe attributes and what they imply (no `<form>` submission, no native dialogs, CORS applies to
  every request).

## Reference app

[`examples/recruiting-ats/`](../examples/recruiting-ats/) is the code folder of a complete app that
shows the whole runtime shape in two views: connect, mount, enumerate a folder, read each file,
follow disk changes, navigate, and write a file back. Copy it into an app folder such as
`Recruiting`, as `Recruiting/code` (the app folder's name is what the library shows), and it runs
as-is. [Reference app](example.md) walks through it.
