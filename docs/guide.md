# Building a Lightfern app

This is the complete contract for a Lightfern **app**: a small app that lives as a folder in your
Lightfern library and is built by Lightfern itself, with no toolchain on your side. Read it before
you create or edit an app, and start from the [reference app](../examples/recruiting-ats/) rather
than inventing structure. Lightfern's built-in assistant writes apps against this same contract, so
what you learn here is what it follows. (This package and some of its names still say "plugin"; a
plugin is an app's code.)

Companion documents:

- [Server code](server.md): the classes that read and change an app's files, which views call like
  ordinary methods. Every app that keeps data needs it.
- [Styling](styling.md): when a view should look like part of Lightfern and when it should have its
  own look, the `--lf-*` design tokens, and CSS recipes for both.
- [The sandbox](sandbox.md): what a view can and can't do inside its iframe, and what differs on a
  link.
- [Multiplayer](multiplayer.md): rooms that people share, with everyone's presence.
- [Reference app](example.md): a walkthrough of the Recruiting ATS example.

## What an app is

An app is a folder in the library. Its manifest routes paths to **views**, the screens the app
shows:

- The **home view** (`contributes.home`) is the app's own screen. It opens when you click the app in
  the library. Think dashboard, tool, or custom workspace.
- **Views** (`contributes.views`) are the other screens. Each has a `match` pattern, and opens for
  the paths it matches: a record or file the view shows (`candidates/ada.md`), or something that
  isn't a file at all (`play/k7f2`, a game session). See
  [Routing paths to views](#routing-paths-to-views).

Most apps center on a home view, but an app made only of views (a CSV viewer, say) is just as valid.

Views show things. **Server code** reads and changes the app's files: small classes that run on
Lightfern's servers, or on the device of someone who can edit the app, which views call like
ordinary methods. See [Server code](server.md).

An app is made of two folders:

- The **app folder** is what the library shows. It holds the files the app works on.
- The **code folder** sits inside the app folder. It holds `manifest.json`, some `.tsx`/`.ts` for
  views and server code, and an optional `styles.css`.

There is **no** `package.json`, `node_modules`, bundler config, or compiled output. The source files
are the artifact. Lightfern transpiles and bundles them in-process on save.

## On a link

People use an app in two places: in the desktop app, and on a **link**,
`https://share.lightfern.com/<share>`. A link is for people who can only use the app, including
visitors who aren't signed in. The guides say "on a link" for everything below.

- Only the app runs, filling the page. There is no library, no file list and no built-in viewers.
- The link's address, `https://share.lightfern.com/<share>`, opens the home view, and
  `https://share.lightfern.com/<share>/<path>` opens the view whose `match` fits `<path>`. See
  [Routing paths to views](#routing-paths-to-views).
- `ctx.fileId` is `null`, and `ctx.currentUser` is `null` for a visitor. Server code gets a visitor
  as its [caller](server.md#methods).
- The browser blocks some features there. See [The sandbox](sandbox.md#whats-blocked).

## How you build one

Any folder that holds a `manifest.json` is a code folder, and the folder that holds it is its app
folder. An app always looks like this:

```
Recruiting/              ← the app folder: the library shows this name, and the app's data lives here
├── candidates/
│   └── ada.md
└── code/                ← the code folder
    ├── manifest.json
    ├── styles.css
    └── src/
        ├── home.tsx
        └── candidates.server.ts
```

**Never create an app inside another app's folder, at any depth.** That includes its code folder. An
app inside another app doesn't run: its code folder says which app it's inside, and its files belong
to the outer app. Before you create an app, look at the destination folder and every folder above
it. If any of them is a code folder (it holds a `manifest.json`) or an app folder (it has a
subfolder that holds one), create the new app somewhere else, such as beside the outer app.

The code folder always goes **inside** an app folder:

- **For a new app,** create the app folder first, named for people (`Habit Tracker`), then create
  the code folder inside it (`Habit Tracker/code`). Write the app's data into the app folder, never
  into the code folder.
- **For an app over files someone already has,** put the code folder in the folder the app works on,
  beside the files and folders it uses: `Hiring/code` next to `Hiring/candidates`, or `Finance/code`
  for CSVs in `Finance/2025`. That folder must not already be inside another app.

The code folder can have any name; `code` is just the convention for new apps. An existing app is
already laid out this way, so don't rename or move its code folder.

The app works on the files in its app folder and its subfolders. The library shows an app as one
row. Clicking it opens the home view. The app's files stay hidden until the person chooses "Show
contents", and the code folder shows as one more row with a code icon. The code folder can't be
moved out of its app folder, so moving the app keeps its code and data together.

**Name the app folder for people.** The library and the home view's tab show its name, so give it a
real name: `Recruiting`, not `recruiting-data`. The manifest's `id` stays a stable slug for the
host.

A few more rules keep apps predictable and safe:

- An app folder runs one app. If it holds more than one code folder, only the first alphabetically
  runs, and the others say the folder already has an app.
- Never put `manifest.json` directly in a folder at the top of the library, such as
  `Habit Tracker/manifest.json`. That folder is then a code folder with no app folder around it, so
  the app works on the whole library.
- A code folder never runs at the top of a shared folder, because there it could read the folder
  each member places the share in. Lightfern won't share a code folder on its own, and won't put a
  `manifest.json` at the top of a shared folder. Share the app folder instead.

Your library is a folder on disk. Create the app's folders and files there however you like: from
inside Lightfern, with any editor pointed at the library folder, or by asking Lightfern's assistant
to write them. Concretely:

1. Create the app folder, then the code folder inside it with its files (`manifest.json`, `src/…`).
2. Lightfern builds on save. Click the app to see its home view.
3. Iterate: edit a file, the view hot-reloads. If it does not compile, the view slot shows a
   structured build error (file, line, column, message). Read it, fix the file, re-save.

## The manifest

```json
{
  "manifestVersion": "3.0",
  "id": "recruiting-ats",
  "name": "Recruiting ATS",
  "version": "1.0.0",
  "dependencies": { "react": "19.2.0", "react-dom": "19.2.0" },
  "contributes": {
    "home": { "entry": "src/home.tsx" },
    "views": [{ "match": "candidates/*.md", "entry": "src/candidate.tsx" }],
    "servers": ["src/candidates.server.ts"]
  }
}
```

- `manifestVersion`: required. This is the SDK version your app is built against, and it covers the
  manifest format, the view and server APIs, the `lightfern:host` and `lightfern:server` imports,
  and the `--lf-*` theme tokens. Use "3.0".
- `id`, `name`, `version`: a URL-safe slug of lowercase letters, digits, `.` and `-`
  (`recruiting-ats`, `com.acme.ats`) that is **unique across every app in the library** (two apps
  sharing an `id` serve one bundle), a human-readable name, and a semver string (display metadata
  only).
- `dependencies`: optional browser packages for views, keyed by package name with an **exact**
  version. Lightfern downloads and caches their esm.sh browser modules before serving them from the
  app's local origin; dependencies are not loaded from remote script URLs. Declare `react` and
  `react-dom` when using React/TSX. Each declared package loads once per view, and its subpaths
  share that copy. A package's required peer dependencies must be declared too. Server code can't
  use them.
- `permissions`: optional; `camera` and `microphone` (see
  [Camera and microphone](sandbox.md#camera-and-microphone)), when a view uses them. Using an
  undeclared capability fails. Views reach files and rooms through server code, which needs no
  permission.
- `network_permissions`: optional; allowed network origins for views, empty by default. An entry is
  an `https://` origin, optionally with a `*.` subdomain wildcard: `https://api.example.com`,
  `https://*.example.com` (matches subdomains only, not `example.com` itself). No paths, no
  `http://`, no `ws(s)://`. A declared origin can serve fetch/XHR data and non-code image, font, and
  media assets. It does not permit remote JavaScript or worker URLs. A view can run code from a blob
  worker, so never turn fetched content into worker code; see
  [The sandbox](sandbox.md#background-workers).
- `contributes.home`: the app's home view (see [Home views](#home-views)). Optional, but it's the
  usual reason to build an app.
- `contributes.views`: the other views, each routed by a `match` pattern (see
  [Routing paths to views](#routing-paths-to-views)). Optional; omit it for a home-only app.
- `contributes.servers`: the app's server modules, as paths ending in their extension. See
  [Server code](server.md).

The schema is enforced by the host and is exported from this package as `manifestSchema` (zod), with
`parseManifest`, `safeParseManifest` and `formatManifestErrors` alongside it.

## Home views

The home view is the app itself: the UI that opens when you click the app in the library. Use it for
a home screen, dashboard, tool, or settings: anything that is about the app rather than one path in
it.

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
any other.

`ctx.path` is the code folder within the app folder for a home view. An app without a `home` has
nothing to open, so its app folder shows as a plain folder.

## Routing paths to views

`contributes.views` is how an app routes paths to its screens. Each entry has:

| Field   | Required | Meaning                                                       |
| ------- | -------- | ------------------------------------------------------------- |
| `match` | yes      | Path pattern for the paths it opens.                          |
| `entry` | yes      | The source module Lightfern builds, e.g. `src/candidate.tsx`. |
| `title` | no       | Label for the view; defaults to the opened path's name.       |

`ctx.open(path)` opens the view whose `match` fits `path`. On a link, so does the address
`https://share.lightfern.com/<share>/<path>`. A path usually names a file or record the view shows,
but needn't: `play/k7f2` can be a game session.

Lightfern never checks whether a file exists at the path. A view opens for any path its `match`
fits, and the view, through its server code, decides what the path means, including a missing file.

```json
"views": [{ "match": "play/*", "entry": "src/home.tsx" }]
```

`ctx.open("play/k7f2")` opens that view with `ctx.path` set to `play/k7f2`, and the view reads the
session's code from it. On a link, the address `https://share.lightfern.com/<share>/play/k7f2` opens
the same view, so another device can open it from a QR code. See
[Choosing room names](multiplayer.md#choosing-room-names) for the room that goes with it.

### When no view matches

| Where   | A path no view matches                                                                                                                              |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop | Opens in Lightfern's own viewer (markdown editor, images, video, PDF, CSV and so on) if a file is there, or reveals the folder in the library tree. |
| A link  | Shows "Nothing here", and `ctx.open` fails. A link has no built-in viewers.                                                                         |

So build a view for everything the app shows, and the app works the same in both places. A home-only
app has no views, so on a link nothing but the home view opens.

On desktop, someone who chooses "Show contents" and clicks a data file directly opens the matching
view, or the built-in viewer if none matches. That's rare; route people with `ctx.open`.

### Patterns

Patterns are matched against paths in the app folder and its subfolders; they can't reach siblings
or parents of that folder. A trailing `/` is rejected.

- `*`: zero or more characters within one segment (never matches `/`).
- `?`: exactly one character within one segment.
- `**`: zero or more whole path segments (only as a complete segment).

| Pattern              | Matches                                             |
| -------------------- | --------------------------------------------------- |
| `*.md`               | markdown files directly in the folder               |
| `**/*.md`            | markdown files at any depth                         |
| `candidates/*.md`    | markdown files directly inside `candidates/`        |
| `**/candidates/*.md` | markdown files inside any folder named `candidates` |
| `play/*`             | `play/k7f2`, with nothing needing to exist there    |

Prefer one view whose pattern covers every path it should open (`"*.md"`) over one view per path.
Several views may point at the same `entry`; they are one mounted view either way.

The matcher is exported from this package as `matchesPattern` (`@lightfern/plugin-sdk/match`) so
tooling can evaluate patterns exactly as the host does.

## Writing a view

Lightfern owns the iframe document: it injects the import map, links `styles.css`, and provides an
empty `<div id="root">`. Your entry module mounts into it. That document is a **sandboxed** iframe;
read [The sandbox](sandbox.md) before you reach for a browser API.

**Imports come from exactly two places:**

- **Relative** imports (`./helpers`) resolve within the code folder. Importing a server module
  (`./candidates.server`) gives the view a stub of each class to pass to `server()` and `room()`.
- **Bare** imports resolve through the host-injected import map. Nothing is installed, and nothing
  else is importable:

  | Import                 | What it is                                                                                                                              |
  | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
  | `lightfern:host`       | The view SDK: `server()` and `room()` to reach server code, `connect()` for the view's context, and their types. Needs no dependencies. |
  | `lightfern:host/react` | React bindings: `useQuery()`, `useRoom()`, `usePath()`, `useFileId()` and `useCurrentUser()`. Requires `react` in `dependencies`.       |
  | A declared dependency  | A locally served esm.sh browser module. `react` also serves `react/jsx-runtime`; declaring `react-dom` permits `react-dom/client`.      |

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

**All data goes through server code.** A view has no file API. It gets what it shows from queries
and changes things by calling methods:

```tsx
import { server } from "lightfern:host";
import { useQuery } from "lightfern:host/react";

import { Candidates } from "./candidates.server";

const candidates = server(Candidates);

function Pipeline() {
  const all = useQuery(candidates.all); // undefined until the first result, then kept current
  // …
  const tick = (path: string, line: number) => void candidates.toggleStep(path, line);
}
```

[Server code](server.md) covers the classes, queries, calls and errors in full.

**Keep code and data separate.** Server code can never write into the code folder; such writes are
refused. Keep the app's data in the app folder or a subfolder of it.

`server()`, `room()`, `useQuery()` and `useRoom()` connect by themselves. Everything else about the
view comes from its context, `ctx`, which `await connect()` resolves. Call it at the top of the
entry module, before rendering: `usePath()`, `useFileId()` and `useCurrentUser()` throw if it hasn't
resolved.

- `ctx.path: string` is the opened path relative to the app folder: the code folder for a home view,
  and the path that was opened for any other view. Pass it to server code when a query or method is
  about the open path, like `useQuery(candidates.steps, path)`. Never build data paths from it in a
  home view, which points into the code.
- `ctx.homePath: string` is the code folder relative to that same root. `ctx.pluginId: string` is
  also available.
- `ctx.currentUser` is the signed-in Lightfern user, or `null` for a visitor on a link who isn't
  signed in. Its type is
  `{ id: string; email: string; name: string | null; profilePictureUrl: string | null } | null`. Use
  it to draw the person; server code gets the same person as its caller and should decide who may do
  what from that. Subscribe with `ctx.onCurrentUserChange(listener)`, or use `useCurrentUser()` in
  React. Rendering a remote `profilePictureUrl` requires its origin in the app's
  `network_permissions`.
- `ctx.open(path: string, newTab?: boolean): Promise<void>` opens the view whose `match` fits
  `path`, or the home view for `""`. Return home with `ctx.open("")`. The path may not reach beyond
  the app folder; `newTab: true` opens beside the current tab. A path no view matches opens a
  built-in viewer or a folder on desktop, and fails on a link (see
  [When no view matches](#when-no-view-matches)).
- `ctx.fileId: string | null` is the opened file's ID: the same for everyone with access to the
  file, and kept through renames and moves. A new file's ID can change once, when it first syncs;
  `onPathChange` (or `useFileId()`) tells you when it does. On a link it is `null`, so key anything
  that must work there on `ctx.path` instead.

The full `ViewContext` type, with its documentation comments, lives in
[`src/context.ts`](../src/context.ts). Its `files` and `multiplayer`, and the hooks built on them
(`useFile`, `useFolder`, `useFileObjectUrl`, `useConnected`, `usePeers`, `useMe`, `useViewId` and
`useSetPresence`), are for apps before 3.0: in a version 3 view, every request they make fails.

### Staying in sync

A view is long-lived: the user navigates to another node it matches (the iframe does not reload;
module state and transitions survive), and the files behind it change. Two bindings keep a view
current:

- `usePath()` turns navigation into state.
- `useQuery(query, ...args)` re-renders whenever the query's result changes, because Lightfern runs
  it again when a file it read changes, whoever changed it.

```tsx
import { usePath, useQuery } from "lightfern:host/react";

const path = usePath(); // needs `await connect()` first
const steps = useQuery(candidates.steps, path); // follows navigation and edits
```

When a call returns, the queries it affected have already re-rendered, so a view can clear what it
was showing in the meantime, like a dragged card.

### Styling

Styling is a plain `styles.css` at the top of the code folder.

Decide first whether the view should look like Lightfern or like its subject. [Styling](styling.md)
covers how to choose, the `--lf-*` design tokens (which follow dark mode for free), and the CSS
recipes for both.

## What is not available

- **Showing an image from the app folder** in a view. Server code can read it, but can't send its
  bytes to a view yet.
- **Browser capabilities the sandbox doesn't grant,** such as `<form>` submission and native
  dialogs. See [The sandbox](sandbox.md).

[Reference app](example.md) walks through [`examples/recruiting-ats/`](../examples/recruiting-ats/),
the code folder of a complete app. Copy it into an app folder such as `Recruiting`, as
`Recruiting/code`, and it runs as-is.
