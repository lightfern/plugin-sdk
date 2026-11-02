# Server code

From `manifestVersion` "3.0", an app's views never touch its files. Its **server code** does: small
TypeScript classes that run on Lightfern's servers, which views call like ordinary methods. Server
code decides every change the app makes to its files, so a view someone has modified can't save a
move, a score or a permission it isn't allowed to.

Use server code for anything that reads or changes the app's files: listing candidates, moving a
card, recording a vote. Views keep everything about showing them: layout, what's selected, what's
being dragged.

## A first example

```json
"contributes": {
  "home": { "entry": "src/home.tsx" },
  "servers": ["src/tasks.server.ts"]
}
```

```ts
// src/tasks.server.ts
import { type Caller, query, Server, UserError } from "lightfern:server";

type Task = { id: string; title: string; done: boolean };

export class Tasks extends Server {
  all = query(async (_caller: Caller) => {
    // No tasks yet until the first one is saved.
    const text = await this.ctx.files.read("tasks.json").catch(() => "[]");
    return JSON.parse(text) as Task[];
  });

  async toggle(caller: Caller, id: string) {
    if (caller.access === "use_only") throw new UserError("You can't change tasks");
    const tasks = JSON.parse(await this.ctx.files.read("tasks.json").catch(() => "[]")) as Task[];
    const task = tasks.find((each) => each.id === id);
    if (!task) throw new UserError("That task is gone");
    task.done = !task.done;
    await this.ctx.files.write("tasks.json", JSON.stringify(tasks), { overwrite: true });
  }
}
```

```tsx
// src/home.tsx
import { server } from "lightfern:host";
import { useQuery } from "lightfern:host/react";
import { createRoot } from "react-dom/client";

import { Tasks } from "./tasks.server";

const tasks = server(Tasks);

function List() {
  const all = useQuery(tasks.all); // undefined until the first result, then kept current
  if (!all) return null;
  return all.map((task) => (
    <label key={task.id}>
      <input type="checkbox" checked={task.done} onChange={() => void tasks.toggle(task.id)} />
      {task.title}
    </label>
  ));
}

createRoot(document.getElementById("root")!).render(<List />);
```

When the view toggles a task, `toggle` saves `tasks.json`, Lightfern runs `all` again because it
read that file, and the list re-renders. Nothing in the view watches files or refetches.

## Server modules

- List each module in `contributes.servers`, as a path within the code folder that ends in its
  extension: `"src/tasks.server.ts"`. Naming them `*.server.ts` keeps them easy to spot.
- Export each class with `export class`. Every exported class must extend `Server` or `Room` from
  `lightfern:server` directly, imported by name.
- Server code can import its own files by relative path, and `lightfern:server`. Nothing else: no
  packages, no `lightfern:host`, no React.
- Views import the class by relative path (`import { Tasks } from "./tasks.server"`). Lightfern
  replaces it in views with a stub that holds none of its code.
- Lightfern builds the server modules when someone who can edit the app saves them, into
  `server.bundle.js` in the code folder, which syncs with the app. Don't edit that file. A build
  error shows on every view that imports the module.
- New server code reaches a running server or room once the bundle has synced and the server or room
  starts again, about 10 seconds after its last event. Until then, a view built from the new code
  can get "Cards has no method deal" for a method it just added; reopen the view to retry.

## `Server` or `Room`

- **`Server`** is a private server: each view gets its own, and it knows nothing about anyone else
  using the app. Use it for tools, trackers and dashboards. Reach it with `server(Cls)`.
- **`Room`** is shared by everyone who joins it by name, and knows who's in it. Use it when people
  work or play together and need to see each other. Reach it with `room(Cls, name)`. See
  [Multiplayer](multiplayer.md).

Both run one event at a time: two calls never interleave, even while one waits for a file. So "read
the board, check the move, write the board" is safe without any locking within one server or room.
Different servers and rooms run side by side, though: an app's home view and file view each have
their own private server. If a file a call read changes before the call saves, from another server,
a room or an edit elsewhere, Lightfern runs the call again on the files as they are now, a few times
at most. So keep methods safe to run again: read, decide, write, and nothing else that lasts.

## Methods

Every public method takes the **caller** first, and views call it without:

```ts
async moveCard(caller: Caller, cardId: string, column: string) { … }  // server
await board.moveCard("card-3", "done");                                 // view
```

```ts
interface Caller {
  user: { id: string; name: string | null; profilePictureUrl: string | null };
  /** The view the call came from. */
  viewId: string;
  access: "owner" | "admin" | "edit_code_and_data" | "read_code_and_data" | "use_only";
}
```

- The first parameter must be written `caller: Caller` (or `_caller: Caller`), with `Caller`
  imported by name from `lightfern:server`. Lightfern's build refuses a public method without it.
- Lightfern sets the caller from the person's sign-in. A view can't change it.
- Decide in every method who may do it. Server code is the only thing that checks; the manifest
  declares no roles.
- `access` says what someone can do outside server code. `owner` is the person whose library holds
  the app, and `admin` and `edit_code_and_data` people can also edit the app's files and code
  directly. People with `read_code_and_data` can read every file, since the files sync to their
  devices. `use_only` isn't given yet.
- Arguments and results go through JSON: a `Date` arrives as a string, and `undefined` fields are
  dropped. Check an argument's shape before you trust it, since a modified view can send anything.
- A method that throws `UserError` fails the call with that message, for the view to show. Any other
  error reaches people who can read the app's code as its message, and everyone else as "Something
  went wrong in this app's server code".
- Make public methods `async`. A view's handle only has methods that return a promise.
- Only public methods, and fields made with `query(...)`, can be called. Any other helper must be
  `private` or a `#name`, since the build refuses a public method whose first parameter isn't the
  caller.
- Names starting with `on` and a capital letter are kept for hooks, and `client`, `then`, `ctx` and
  `constructor` can't be method names.

## Files

`this.ctx.files` reads and changes the app's files. Paths are relative to the app folder (`""` is
the folder itself). A path can't leave the app folder or have a dot-prefixed part. Writes, moves and
deletes in any code folder, of a `manifest.json` or under `node_modules` are refused.

```ts
interface Files {
  read(path: string): Promise<string>;
  read(path: string, encoding: "binary"): Promise<Uint8Array>;
  list(folder: string): Promise<readonly { path: string; name: string; kind: "file" | "folder" }[]>;
  write(
    path: string,
    content: string | Uint8Array,
    options?: { overwrite?: boolean }
  ): Promise<void>;
  move(from: string, to: string): Promise<void>;
  delete(path: string): Promise<void>;
}
```

- **A call is all-or-nothing.** Writes, moves and deletes apply when the method returns, and none of
  them apply if it throws. So check everything first, or throw after writing; either way nothing is
  half-saved.
- Reads later in the same call see its own writes, deletes and moves.
- A call can write the same file more than once; the last write is saved. It can't move a file it
  changed, or change a file it moved: do that in another call.
- A write you forget to `await` still saves: the call ends only once its file requests have.
- `write` refuses a path already taken, unless you pass `{ overwrite: true }`.
- Save data as compact JSON (`JSON.stringify(data)`, no indent).
- People who can edit the app's files can still change them directly, as Lightfern's assistant does.
  Don't assume a file is exactly as your code last left it; parse it defensively.

## Queries

A query is a field made with `query(...)`. It only reads, and views subscribe to it:

```ts
customers = query(async (caller: Caller, stage: string) => { … });  // server
const leads = useQuery(crm.customers, "lead");                      // view
```

- Lightfern records the files each run reads and the folders it lists, and runs the query again
  whenever one of them changes: from this server's own calls straight away, and from edits made
  anywhere else, such as an agent editing a file or another device, once they sync.
- Each subscription runs as the view that made it, with that view as the caller, and its results go
  only to that view. So a query can return only what that person should see.
- A query that writes, moves or deletes a file fails with "A query can't write files", and one that
  sends a message fails with "A query can't send messages".
- A view can also call a query once: `await crm.customers("lead")`.
- `useQuery` returns `undefined` until the first result, shares one subscription between components
  asking for the same query and arguments, and throws the query's error for an error boundary.
  Outside React, `crm.customers.subscribe(["lead"], onResult, onError)` returns a function that
  stops it.
- Return what the view shows, not whole files. A query re-sends its whole result each time it
  changes.

Use queries for what views show. Use methods for changes. Use messages (below) for events.

## Messages

`this.ctx.send(data)` sends `data` to every view connected to this server or room. Views receive it
with `client.onMessage((data) => …)`, which returns a function that stops it.

- Nothing keeps a message. A view that isn't connected misses it.
- A call's messages go out once its changes are saved, and not at all if it throws.
- Tag your own messages, like `{ type: "yourTurn" }`.
- Use messages for events, such as a turn starting or a sound. What a view shows should come from a
  query, so a view that missed a message is still right.

## Hooks

```ts
protected onStart(): void | Promise<void>;           // Server and Room
protected onJoin(caller: Caller): void | Promise<void>;  // Room only
protected onLeave(caller: Caller): void | Promise<void>; // Room only
```

- `onStart` runs each time the server or room starts, including after it was unloaded, before the
  event that started it. Its writes save and its messages go out like a method's. If it fails, the
  event fails too, and the next event runs it again.
- `onJoin` and `onLeave` are in [Multiplayer](multiplayer.md).

## Memory doesn't last

A server or room is unloaded about 10 seconds after its last event, and fields on the class are lost
then. Keep anything that should last in files. A field is fine as a cache of something you can read
again.

Module-level variables (`const cache = new Map()` outside the class) may be shared by every server
and room running the same server code, including other people's copies of the same app, so never
keep anyone's data there.

## Limits

- No network: `fetch` fails.
- No timers: `setTimeout`, `setInterval` and `scheduler.wait` throw. A server can't act on its own,
  only when a view calls it.
- About one second of CPU per call. A call that loops forever fails, and the server keeps handling
  other calls, but it starts again: fields are lost and `onStart` runs again.
- Calls, results and messages are JSON, and should stay well under 1 MiB.

## What you can't hide

Everyone who can use an app today can read its files, because they sync to their devices. So files
can't hold secrets from the people using the app: a poker deck's order, sealed bids, quiz answers
before a round, or one person's private notes in a shared app. Server code decides what changes, not
what can be read.

## Offline

Server code runs on Lightfern's servers. While a view can't reach them, its calls wait, then fail
with code `"offline"` after 10 seconds, and its queries keep their last result. Show that the app is
offline with `client.status`.

A handle whose status is `"refused"` stays refused: the person has no access to the app, app servers
aren't turned on for them yet, or a room turned them away. Calls fail with code `"refused"` and the
reason. To try again, call `client.close()` and make a new handle.

## Reference

```ts
// From "lightfern:server"
abstract class Server {
  protected readonly ctx: ServerContext;
  protected onStart?(): void | Promise<void>;
}

abstract class Room extends Server {
  protected readonly ctx: RoomContext;
  protected onJoin?(caller: Caller): void | Promise<void>;
  protected onLeave?(caller: Caller): void | Promise<void>;
}

interface ServerContext {
  readonly files: Files;
  send(data: unknown): Promise<void>;
}

interface RoomContext extends ServerContext {
  readonly roomName: string;
  /** Everyone in the room, once each with all their views, including the caller. */
  readonly participants: readonly Peer[];
  sendTo(viewId: string, data: unknown): Promise<void>;
}

function query<Args extends unknown[], Result>(
  fn: (caller: Caller, ...args: Args) => Promise<Result>
): Query<Args, Result>;

class UserError extends Error {}

// From "lightfern:host"
function server<T extends Server>(cls: new () => T): ServerHandle<T>;
function room<T extends Room, Presence = unknown>(
  cls: new () => T,
  name: string
): RoomHandle<T, Presence>;

// A handle has the class's methods and queries, without the caller, and the connection as `client`.
interface ServerClient {
  /** "connecting" | "connected" | "offline" | "refused" */
  readonly status: ServerStatus;
  onStatusChange(listener: (status: ServerStatus) => void): () => void;
  onMessage(listener: (data: unknown) => void): () => void;
}

// From "lightfern:host/react"
function useQuery<Args extends unknown[], Result>(
  query: QueryMethod<Args, Result>,
  ...args: Args
): Result | undefined;
```

- `server(Cls)` and `room(Cls, name)` are synchronous: they connect in the background, and calls
  wait for the connection. They, `useQuery` and `useRoom` need no `connect()` first. Calling them
  again with the same class (and name) returns the same handle.
- A failed call rejects with a `PluginRpcError`. Its `code` is `"offline"` when the server can't be
  reached and `"refused"` when the person can't use the app; otherwise its `message` is the server's
  error.
- The full types, with their documentation comments, are in [`src/server.ts`](../src/server.ts) and
  [`src/servers.ts`](../src/servers.ts).
