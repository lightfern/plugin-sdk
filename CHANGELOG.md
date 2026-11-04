# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow the scheme in
[the README](README.md#versioning), where the major and minor equal the `manifestVersion` the SDK
implements.

## [Unreleased]

## [3.0.3] - 2026-11-04

- The guide describes `contributes.views` as routing: a view opens for any path its `match` fits,
  whether or not a file is there, such as a `play/*` view for a game session. It says what opens for
  a path no view matches: on desktop a built-in viewer or a folder in the library tree, and on a
  link "Nothing here". It tells you to build a view for everything the app shows.
- The guide has a section on links (`https://share.lightfern.com/<share>`): only the app runs, there
  are no built-in viewers, `ctx.fileId` is `null`, and `ctx.currentUser` is `null` for a visitor.
  The guides now call them "a link" throughout.
- The guide says before the folder layout that an app is never created inside another app's folder,
  and how to check the destination.
- The server code guide says where server code runs: on Lightfern's servers for a shared app in
  sync, and otherwise on the device of someone who can edit the app, against their local files. The
  guide's intro now says the same.
- `use_only` is given now, by a "Can use" invitation or a link. The server code and multiplayer
  guides say that only `use_only` people can't read an app's files, and describe visitors on a link
  who aren't signed in.
- The multiplayer guide covers rooms named from a path, one per session, and phones as controllers
  that send their input as presence to a room with no methods.
- The sandbox guide is shorter. It drops what any browser page already does, groups what's blocked,
  and says what differs on a link: clipboard, camera, microphone and geolocation are blocked, motion
  sensors work, and `window.open` opens a new tab. It says to call
  `DeviceMotionEvent.requestPermission()` before anything in the tap handler waits, that the desktop
  app defines `DeviceMotionEvent` without sensors, and how to read tilt from
  `accelerationIncludingGravity`.
- The guide gives exact types for `ctx.path`, `ctx.homePath`, `ctx.currentUser`, `ctx.open` and
  `ctx.fileId`, and drops its repeats of the styling and reference app guides.

## [3.0.2] - 2026-11-03

- The sandbox guide shows the view's iframe granting each feature to any origin (`accelerometer *`)
  and granting `magnetometer`, as Lightfern now does, so motion events reach views in Safari.

## [3.0.1] - 2026-11-03

- The server code guide says how saves work: a call replies once its changes are kept, they reach
  the library a moment later, and they merge with changes made elsewhere, the last write winning,
  instead of a call running again when a file changed. It covers how JSON, arrays, counters, CSV and
  text merge, and how to design files for it.
- Lightfern no longer writes `server.bundle.js` into the app's code folder; it keeps the build
  itself.
- `use_only` is for using an app fully, changes included, without reading its files. The examples no
  longer refuse changes from it.
- `write`'s check for a path that's already taken holds only within one server or room. Across them,
  a collision loses the later call's changes after it replied.
- A view always reaches server code built from the same version of the app's code. Views on a newer
  version get servers and rooms of their own.

## [3.0.0] - 2026-11-02

`manifestVersion: "3.0"`. Apps get server code, and views reach their files and rooms only through
it. Lightfern runs version 3 apps only for people with app servers turned on until it's stable;
older apps keep working as they are.

- **Breaking:** views of version 3 apps have no file API and no presence rooms. `ctx.files` and
  `ctx.multiplayer` refuse every request, and the `files.read`, `files.write` and `multiplayer`
  permissions do nothing.
- Server code: classes that extend `Server` (a private server, one per view) or `Room` (shared by
  name), from `@lightfern/plugin-sdk/server` (`lightfern:server` in an app), listed under
  `contributes.servers` as paths ending in their extension. Every public method takes the caller
  (`{ user, viewId, access }`) first. `this.ctx` has the app's `files`, `send`, and in a room
  `roomName`, `participants` and `sendTo`. Hooks: `onStart`, and in rooms `onJoin`, which can throw
  to refuse a view, and `onLeave`. `UserError` shows its message to the person. See
  [Server code](docs/server.md).
- Live queries: `customers = query(async (caller, stage) => …)` only reads, and Lightfern runs it
  again whenever a file it read changes. Views subscribe with `useQuery(crm.customers, "lead")`.
- Views reach server code through handles: `server(Crm)` and `room(Cards, "123abc")` from
  `lightfern:host`, with `useRoom(Cards, "123abc")` and `useQuery` in `lightfern:host/react`. A
  handle has the class's methods and queries, and its connection as `client`: `status`,
  `onStatusChange` and `onMessage`, and in a room `peers`, `me`, `viewId`, `setPresence`,
  `onPeersChange`, `onMeChange` and `close`. A failed call's `code` is `"offline"` or `"refused"`.
- Access levels say what someone can do outside server code: `owner`, `admin`, `edit_code_and_data`,
  `read_code_and_data` and `use_only`.
- The [guide](docs/guide.md), [Multiplayer](docs/multiplayer.md) and the
  [reference app](docs/example.md) are rewritten for version 3.

## [2.5.2] - 2026-10-29

- The [guide](docs/guide.md#how-you-build-one) says apps don't nest: an app folder inside another
  app folder doesn't run, and only the outermost app does.

## [2.5.1] - 2026-10-27

- The [Multiplayer](docs/multiplayer.md#people-and-their-views) guide shows how to give each of a
  person's devices its own job, like a card game's table on a TV and each player's hand on their
  phone, as well as showing each person once.

## [2.5.0] - 2026-10-26

`manifestVersion: "2.5"`.

- A room shows each person once, however many windows, tabs or devices they have it open in.
  - `peers` now has one entry per person, not one per view.
  - Your own other views are no longer in `peers`. They're in the new `room.me`.
  - Apps that grouped peers by `user.id`, as the 2.3 docs said to, see no change.
- Each peer has `views`, every view they have open in the room, most recently active first. Each
  view has a `viewId`, its `presence` and `activeAt`, the server's time when it joined or last set
  its presence.
- A peer's `presence` is their most recently active view's, and `peerId` is now their user ID.
- Add `room.me`, `room.viewId` and `room.onMeChange`, and the `useMe(name)` and `useViewId(name)`
  React hooks.
- The [Multiplayer](docs/multiplayer.md#people-and-their-views) guide says how to handle one person
  in several views: seats, a TV with a phone as its remote, and testing alone.

## [2.4.1] - 2026-10-23

- The docs call plugins apps. An app's code folder sits in its app folder, which the library shows
  as one row. An app folder runs one app, and a code folder never runs at the top of a shared
  folder. See [How you build one](docs/guide.md#how-you-build-one).

## [2.4.0] - 2026-10-22

`manifestVersion: "2.4"`.

- Add the `camera` and `microphone` permissions. Each lets a view use that device through
  `getUserMedia`. See [Camera and microphone](docs/sandbox.md#camera-and-microphone).
- Views can use motion sensors without a permission. See
  [Motion sensors](docs/sandbox.md#motion-sensors).

## [2.3.1] - 2026-10-16

- `ctx.fileId` is now documented as the file's ID from the start, which can change once when a new
  file first syncs. It is `null` only where there is no library, like the public share viewer.

## [2.3.0] - 2026-10-16

`manifestVersion: "2.3"`.

- Add `ctx.multiplayer.joinRoom(name)`: a room shared by everyone who holds the app and joins the
  same name, where each person sets a presence value and sees everyone else's, with their identity
  set by Lightfern's server. Needs the new `multiplayer` permission.
- Add `ctx.fileId` and the `useFileId()` hook: the opened node's server file ID, which stays the
  same through renames, so a room can be per file.
- Add the `useConnected(name)`, `usePeers(name)` and `useSetPresence(name)` React hooks.
- Add the [Multiplayer](docs/multiplayer.md) guide.

## [2.2.0] - 2026-10-08

`manifestVersion: "2.2"`.

- Add `useFolder(path)` to keep a folder's immediate entries in sync with disk changes.
- Export `package.json`, so a host can read the SDK version.
- `docs/versioning.md` is folded into the README's Versioning section.
- The guide says a declared package's subpaths share its instance, with three.js add-ons as the
  example.
- The guide says to declare the latest major, with the earliest minor that has everything the plugin
  uses, instead of naming a fixed version.

## [2.1.1] - 2026-09-29

- The styling guide now says when a view should have its own look instead of matching the app
  (games, documents meant to leave the app, brands, media, formats with a fixed look), and what a
  themed view must get right: no `--lf-*` tokens, a restyled `body`, every state themed, and fonts
  from Google Fonts or the plugin folder.
- The styling guide states its token rules once instead of three times.

## [2.1.0] - 2026-09-29

`manifestVersion: "2.1"`.

- `permissions` is optional and defaults to `[]`, the same as `network_permissions`. A plugin that
  leaves it out should declare `"2.1"`.

## [2.0.1] - 2026-09-28

- The guide now tells plugins to save their data files as compact JSON, while keeping
  `manifest.json` indented.
- Document screen wake lock, fullscreen, inline styles and blob workers in the sandbox guide.

## [2.0.0] - 2026-09-24

`manifestVersion: "2.0"`. A plugin that doesn't use React no longer needs `react` in its
dependencies.

- `manifestVersion` is now a string that includes the minor version, like `"2.0"`, so a plugin can
  say it needs something from a newer release. Lightfern runs a plugin when they're on the same
  major version and Lightfern's minor version is the same or newer. Plain numbers like `2` still
  work and mean `"2.0"`. Adds `supportsManifestVersion` and `manifestVersionSchema`.

- **Breaking:** the React bindings (`usePath`, `useFile`, `useFileObjectUrl`, `useCurrentUser`) move
  from `lightfern:host` to `lightfern:host/react`, and the package export `./view` becomes
  `./react`. `lightfern:host` is now React-free, so a view that only imports `connect()` loads
  without declaring `react`.

## [1.2.0] - 2026-09-23

- Expose the signed-in user's ID, name, email, and profile picture URL as `ctx.currentUser`, with
  `ctx.onCurrentUserChange` and `useCurrentUser()` for sign-in state changes.

## [1.1.0] - 2026-09-23

- Export `./docs/*` and `./examples/*`, so a consumer can load the guide and the reference plugin
  source through the package instead of by relative path.

## [1.0.0] - 2026-09-23

Initial public release of the `manifestVersion: 1` plugin contract.

- Manifest types and zod schema (`parseManifest`, `safeParseManifest`, `formatManifestErrors`),
  including `permissions`, `network_permissions`, `dependencies` and `contributes.home` / `views`.
- View runtime: `connect()` resolves a `ViewContext` with `pluginId`, `path`, `homePath`, the
  `files` API (`read`, `write`, `list`, `move`, `delete`, `watch`), `open` and `onPathChange`.
- React bindings: `usePath`, `useFile`, `useFileObjectUrl`.
- Wire protocol types shared by the host and the sandboxed view.
- Segment-aware glob matcher for view `match` patterns and the network-permission validator.
- `theme.css`: the `--lf-*` design tokens the host links into every view.
- Authoring guide under `docs/` and the Recruiting ATS reference plugin under `examples/`.
