# Moving an app to version 3

An app whose `manifestVersion` is before "3.0" is an older app. Its views read and write its files
themselves. From version 3, views have no file API: [server code](server.md) reads and changes the
app's files, and views call it. Lightfern still runs older apps, but won't keep doing so. Move an
older app to version 3 before you do anything else with it.

## What stays the same

- The app folder, the code folder and the data files. Data paths start from the app folder in both
  versions, so `candidates/ada.md` stays where it is. Don't move, rename or reformat data files.
- `id`, `name`, `version`, `dependencies`, `network_permissions`, `styles.css`, `contributes.home`,
  and `contributes.views` with their `match` patterns. Keeping the patterns keeps every file that
  opened in a view opening there, so a moved app's routes stay file names like `candidates/ada.md`.
  That's expected; only a new app names its routes for what they show.
- `connect()`, `ctx.open`, `ctx.fileId`, `ctx.onPathChange`, `usePath()` and `useFileId()`. A view
  other than the home view gets the same `ctx.path` as before.
- Views can still `fetch` from the origins in `network_permissions`. Server code can't.

## What changes

| Before 3.0                                                                                     | From 3.0                                                                   |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `ctx.files.read`, `list` and `watch`; `useFile`, `useFolder`                                   | A [query](server.md#queries) in server code, and `useQuery` in the view    |
| `ctx.files.write`, `move` and `delete`                                                         | A [method](server.md#methods) in server code, which the view calls         |
| `ctx.multiplayer.joinRoom`; `useConnected`, `usePeers`, `useMe`, `useViewId`, `useSetPresence` | A `Room` class, joined with `room()` or `useRoom()`; see [Rooms](#rooms)   |
| `useFileObjectUrl` for an image in the app folder                                              | Not available yet; see [What can't move yet](#what-cant-move-yet)          |
| The `files.read`, `files.write` and `multiplayer` permissions                                  | Removed. `camera` and `microphone` stay.                                   |
| `ctx.homePath`, and a home view's `ctx.path`: the code folder                                  | `""`, the app folder                                                       |
| `ctx.currentUser`: the Lightfern account, email included, from the start                       | `null` until the view first reaches its server code; see [People](#people) |

## Steps

1. **Read the whole app.** Read `manifest.json` and every view. List every `ctx.files` call, every
   file hook, every room, every use of `ctx.homePath` and `ctx.currentUser`, and every asset URL.
2. **Write the server code.** Put it in `src/<name>.server.ts`, as a class that extends `Server`.
   Use `Room` instead only when people using the app see each other, as with presence. List the file
   in `contributes.servers`.
   - Each read becomes a query that returns what the view shows. A query runs again by itself when a
     file it read changes, so nothing replaces `watch`.
   - Catch reads of files that may not exist yet, as in `.catch(() => "[]")`. A query's error
     reaches the view as a thrown error, and an older view has no error boundary to catch it.
   - Each write, move or delete becomes a method. Check its arguments, and decide in it who may make
     the change. Unless the person asks otherwise, keep it as it was: anyone using the app may.
   - A view that read a file and then wrote it back, or chose something from its copy of the data (a
     free file name, a record to copy), moves that whole sequence into one method.
   - Build file paths in server code from names the view passes. Never take a file path from a view:
     a modified view can send any path. For a view whose pattern is `candidates/*.md`, pass the file
     name, check it's one segment ending in `.md`, and build `candidates/${file}`. A view over files
     anywhere in the app folder, such as `**/*.csv`, passes its route; check that it ends in `.csv`.
   - Server code may run on Lightfern's servers, in another time zone. A view that saved a local
     date, such as today's, passes it to the method as an argument.
   - Types and parsing that views and server code both need go in a plain module that both import.
     Everything a view imports reaches everyone who uses the app.
3. **Rewrite the views.** Make a handle with `server(Cls)` at the top of each view module. Replace
   reads with `useQuery(handle.query, ...args)` and writes with `await handle.method(...args)`.
   Delete code that watched files or read them again after a write. A view that showed a change at
   once, like a dragged card, keeps showing it until the query's result has it, and drops it if the
   call fails.
4. **Fix the paths.** Anything built from `ctx.homePath`, or from a home view's `ctx.path`, now
   starts from the app folder rather than the code folder. Write asset URLs (`src`, `href`, `url()`)
   from `/`, the code folder: `<img src="/logo.png">`. `ctx.open(ctx.homePath)` still opens the home
   view.
5. **Update the manifest.** Set `"manifestVersion": "3.1"`, remove the `files.read`, `files.write`
   and `multiplayer` permissions, and add `contributes.servers`.
6. **Check it.** Render every view and read the console. Try each change the views make, and check
   the files it saves are the same as before.

## Rooms

A room that carried only presence becomes an empty class in a server module, which runs no server
code:

```ts
// src/board.server.ts
import { Room } from "lightfern:server";

export class Board extends Room {}
```

```tsx
import { useRoom } from "lightfern:host/react";

import { Board } from "./board.server";

function Card({ id }: { id: string }) {
  const { client } = useRoom<Board, Presence>(Board, "board");
  const viewers = client.peers.filter((peer) => peer.presence?.card === id);
  return <div onPointerEnter={() => client.setPresence({ card: id })}>{viewers.length} here</div>;
}
```

The room's API moves onto `client`:

| Before 3.0                                   | From 3.0                                          |
| -------------------------------------------- | ------------------------------------------------- |
| `await ctx.multiplayer.joinRoom("board")`    | `room(Board, "board")`, or `useRoom` in React     |
| `room.peers`, `onPeersChange`, `setPresence` | The same on `client`                              |
| `room.me`, `room.viewId`                     | `client.me`, `client.viewId`: `null` until in     |
| `room.connected`, `onConnectedChange`        | `client.status === "connected"`, `onStatusChange` |
| `room.leave()`                               | `client.close()`                                  |

The React hooks map the same way, from one `useRoom(Board, "board")` handle:

| Before 3.0                | From 3.0                        |
| ------------------------- | ------------------------------- |
| `usePeers("board")`       | `client.peers`                  |
| `useMe("board")`          | `client.me`                     |
| `useViewId("board")`      | `client.viewId`                 |
| `useSetPresence("board")` | `client.setPresence`            |
| `useConnected("board")`   | `client.status === "connected"` |

The handle and its `client` stay the same object while the view uses the room, so they're safe in an
effect's dependencies.

When views saved the room's moves to files themselves, those writes become methods on the room
class. Never take the room's file from an argument. Use a fixed path, like `board.json`, for a file
every room shares. A room with files of its own builds their path from `this.ctx.roomName`, which a
view chooses, so check it as you would any name a view sends. See [Multiplayer](multiplayer.md).

Until everyone has the new code, people on the old version and the new don't see each other's
presence.

## People

- `caller.user.id` in server code, `ctx.currentUser.id` and `peer.user.id` are an ID only this app
  gets, not the Lightfern account ID older apps got. Records saved under an old ID match no one.
  Keep them, show them as they are, and save new ones under `caller.user.id`.
- Take a person's ID from `caller` in server code, never from an argument a view passes.
- Names, emails and pictures are set only while no public link reaches the app; otherwise they're
  `null`. See [Methods](server.md#methods). Where the app showed an email, show the name, or ask the
  person for one.

## What can't move yet

- **Images and other files from the app folder in a view.** Server code can read them, but can't
  send their bytes to a view yet. Images in the code folder load from `/` as before. Leave the rest
  out, and tell the person what's missing.
- **Timers and network in server code.** A view that fetched data or refreshed on a timer keeps
  doing that in the view, then calls a method to save what it got.
