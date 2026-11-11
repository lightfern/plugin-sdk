# Server code

From `manifestVersion` "3.0", an app's views never touch its files. Its **server code** does: small
TypeScript classes that run on Lightfern's servers, or on the device of someone who can edit the app
when the servers aren't needed (see [Where it runs](#where-it-runs)), which views call like ordinary
methods. Server code decides every change the app makes to its files, so a view someone has modified
can't save a move, a score or a permission it isn't allowed to.

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

  async toggle(_caller: Caller, id: string) {
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
- Lightfern builds the server modules when someone who can edit the app saves them, and keeps the
  build itself; nothing is added to the app's folder. A build error shows on every view that imports
  the module.
- A view always reaches server code built from the same version of the app's code as the view. When
  the code changes, views running the new version get servers and rooms of their own, while views
  still on the old one stay where they are: a device that hasn't synced the change yet, or people
  using the app's published version until an editor publishes again. Until everyone is on one
  version, a room is split in two: both halves share the app's files, but not presence, messages or
  fields.

## `Server` or `Room`

- **`Server`** is a private server: each view gets its own, and it knows nothing about anyone else
  using the app. Use it for tools, trackers and dashboards. Reach it with `server(Cls)`.
- **`Room`** is shared by everyone who joins it by name, and knows who's in it. Use it when people
  work or play together and need to see each other. Reach it with `room(Cls, name)`. See
  [Multiplayer](multiplayer.md).

Within one server or room, a call whose changes build on a file another call changed while it ran
runs again on the new version. So "read the board, check the move, write the board" is safe without
any locking there; see [Saves merge, and the last write wins](#saves-merge-and-the-last-write-wins).
Different servers and rooms run side by side, though: an app's home view and another view each have
their own private server, and so does each person using a `Server` app. Their saves merge with each
other's, and with every other change to the files; see
[Saves merge, and the last write wins](#saves-merge-and-the-last-write-wins).

## Methods

Every public method takes the **caller** first, and views call it without:

```ts
async moveCard(caller: Caller, cardId: string, column: string) { … }  // server
await board.moveCard("card-3", "done");                                 // view
```

```ts
interface Caller {
  user: {
    id: string;
    name: string | null;
    email?: string | null;
    profilePictureUrl: string | null;
  };
  /** The view the call came from. */
  viewId: string;
  access: "owner" | "admin" | "edit_code_and_data" | "read_code_and_data" | "use_only";
}
```

- The first parameter must be written `caller: Caller` (or `_caller: Caller`), with `Caller`
  imported by name from `lightfern:server`. Lightfern's build refuses a public method without it.
- Lightfern sets the caller from the person's sign-in. A view can't change it.
- `user.id` is an ID only this app gets. It's the same for someone in the desktop app and on a link,
  and different in every app, so apps can't follow a person between them.
- Lightfern gives an app a person's name, email and picture only when no public link reaches the app
  or any of its files: the app isn't shared, or it's shared only with people invited to it. Everyone
  who can open it then was invited by name, so they may know each other.
- Otherwise `user.name`, `user.email` and `user.profilePictureUrl` are `null`. If an app needs a
  name there, ask the person for one. Making a link public, for the app or a folder holding it,
  turns them `null` from the next time each view connects.
- `user.name` and `user.profilePictureUrl` can also be `null` in a private app, when the person's
  account has none. Show `user.email` instead.
- Someone using the app on a [link](guide.md#on-a-link) without signing in is a visitor. Their
  `user.id` starts with `visitor-`, stays the same while they use the same browser, and is different
  in every app, so apps can't follow a visitor between them. Anyone with the link can be one, and a
  private window makes a new one, so never treat it as proof of who they are.
- Decide in every method who may do it. Server code is the only thing that checks; the manifest
  declares no roles.
- `access` says what someone can do outside server code. `owner` is the person whose library holds
  the app, and `admin` and `edit_code_and_data` people can also edit the app's files and code
  directly. People with `read_code_and_data` can read every file, since the files sync to their
  devices. `use_only` people use the app as fully as anyone, changes included, but only through its
  views: they can't read its files or code. It's for sharing a usable app without the data under it:
  people get it from a "Can use" invitation or a link.
- Arguments and results go through JSON: a `Date` arrives as a string, `NaN` and `Infinity` as
  `null`, and `undefined` fields are dropped. A left-out argument arrives as `null`, and an optional
  parameter whose type doesn't include `null` gets `undefined` instead, so its default applies.
- Lightfern checks each argument against its parameter's TypeScript type before the method runs, so
  a modified view can't send text where a number belongs. The call fails with a message that names
  where, like `move's move.to must be "todo" or "done"`. It checks strings, numbers, booleans,
  `null`, literal values, unions, arrays, tuples, object types, `Record<string, T>`, and type
  aliases and interfaces from the server module or the app's own files.
- It doesn't check anything else, like a `Map`, a class, `keyof` or a generic type. It also lets
  through extra properties on an object and any key in a `Record`. Check those yourself, and check
  values against your app's rules either way: a type can't say "a card in your hand".
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
- Start every read a call or query needs at once, with `Promise.all`, and never `await` reads one by
  one in a loop. Reads started together reach the library in one request, while a loop waits for
  each in turn, and only six requests to the library can wait at once (see [Limits](#limits)). List
  the folders you need together too, then read their files together:

  ```ts
  const entries = await this.ctx.files.list("candidates");
  const files = entries.filter((e) => e.kind === "file");
  const texts = await Promise.all(files.map((e) => this.ctx.files.read(e.path)));
  ```

- A call can write the same file more than once; the last write is saved. It can't move a file it
  changed, or change a file it moved: do that in another call.
- A write you forget to `await` still saves: the call ends only once its file requests have.
- `write` refuses a path already taken, unless you pass `{ overwrite: true }`. That holds for what
  this server or room can see. If another server, room or device creates the same path first, the
  library refuses the save a moment later and the whole call's changes are lost, after the call
  replied. Name new files so that can't happen, for example with `crypto.randomUUID()`.
- Save data as compact JSON (`JSON.stringify(data)`, no indent).
- People who can edit the app's files can still change them directly, as Lightfern's assistant does.
  Don't assume a file is exactly as your code last left it; parse it defensively.

## Saves merge, and the last write wins

A call replies as soon as Lightfern has kept its changes, without waiting for the library. The same
server or room sees them straight away; everyone else gets them a moment later, once the library
does. If the library is out of reach, they wait and go when it's back.

A call saves its changes the way a device saves edits. Each write carries the version of the file
the call read, and whatever changed in that file since then merges in, whoever changed it: another
server or room of the app, someone editing the file directly, an agent or another device. A save
never fails because a file changed, and the library never makes a call run again. It's the same rule
as everywhere else in Lightfern, so a file means the same thing whoever wrote it. In the rare case
the library refuses a change outright, it's dropped and the app's queries go back to what the
library holds.

How files merge:

- **JSON** merges key by key, all the way down. Two people setting different fields of one record
  both keep their change.
- An array whose items are all objects with a unique `id` merges item by item, matched by `id`, in
  order. Any other array is replaced whole.
- `{ "__counter__": 5 }` is a counter: increments made in two places add up instead of one replacing
  the other.
- Where both changed the same value, the later save wins.
- **CSV** merges cell by cell, and markdown and other text merge like two people typing together.
  Any other file is replaced whole: the later save wins.

What that means for your code:

- Within one server or room, calls run at the same time. A call whose changes build on a file
  another call changed while it ran runs again on the new version, so read, check, write is safe
  there. Since a call can run twice, don't count on a field it changes changing only once.
- Across servers, rooms and other writers, nothing checks again what a call read. Two private
  servers can each check a rule and both save, breaking it: two people each taking the last seat, or
  prices that must add up to 100. Keep a rule like that inside one room.
- Store one record per file, like `contacts/ada.json`, not every record in one file, so unrelated
  edits never touch the same values.
- Keep lists as arrays of objects with `id`s, or as objects keyed by ID, so items added in two
  places both survive. An array of plain values is replaced whole.
- Compute totals and counts in queries rather than storing them: a stored total goes wrong when two
  saves merge.
- Use a counter for a number many people change at once, like votes or a score.

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
- A call's messages go out once its changes are kept, and not at all if it throws.
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
- At most six requests to the library wait at once, and more queue until one answers. Reads started
  together go as one request, and each `list` is its own.

## Keeping an app secure

Who can see what:

- **Everyone who opens the app gets the code folder, except its server code.** Views run in the
  person's browser, so their code, `styles.css`, images and any other file in the code folder reach
  everyone who uses the app, including visitors on a public link. Server classes never do, but a
  helper module that a view imports does, even if server code imports it too.
- **People with `read_code_and_data` access or more can read every file**, server code included,
  because the files sync to their devices.
- **`use_only` people, including visitors on a link, see only what server code returns to them.**

So:

- Never put secrets, keys, private data or lists of who may do what in the code folder. Keep data in
  the app folder, where only server code reads it for people who can only use the app.
- Files can't hold secrets from people with read access: a poker deck's order, sealed bids, quiz
  answers before a round, or one person's private notes in a shared app.
- Decide who may do what in server code, from the `caller`, in every method and query. Hiding a
  button in a view protects nothing: a modified view can call any method.
- Never take a file path from a view. A view can send any path, so a method that reads or writes the
  path it's given reaches every file in the app folder. Take a name or ID, check it, and build the
  path in server code: `candidates/${name}.md`.
- A visitor's ID isn't proof of who they are. See [Methods](#methods).
- Never render file contents or other people's input as HTML, with `innerHTML` or
  `dangerouslySetInnerHTML`. A script that gets into a view runs as the person viewing it, and can
  call server code as them.

## Where it runs

Server code runs on Lightfern's servers when the app is shared and the person's copy of its code has
synced, so everyone using the app shares its rooms. People on a link get the app's published
version, and the server code built from that version. For someone who can edit the app's files, it
runs on their own device instead whenever the servers aren't needed: offline, in an app that isn't
shared, or while their changes to its code are still syncing. It works on their local files, and
sync carries the changes like any edit. It's the same code with the same rules, except that:

- A room on the device holds only that person's views.
- A save there replaces the file as the call left it. Sync merges it with edits made elsewhere when
  it sends it.

Once the app is shared and in sync again, its views reconnect to the servers. The files carry over;
presence and fields start again.

For anyone else, while a view can't reach the servers, its calls wait, then fail with code
`"offline"` after 10 seconds, and its queries keep their last result. Show that the app is offline
with `client.status`.

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
// `room()` and `useRoom()` are in Multiplayer.

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

- `server(Cls)` is synchronous: it connects in the background, and calls wait for the connection. It
  and `useQuery` need no `connect()` first. Calling it again with the same class returns the same
  handle. [`room()`](multiplayer.md#joining-a-room) works the same way.
- A failed call rejects with a `PluginRpcError`. Its `code` is `"offline"` when the server can't be
  reached and `"refused"` when the person can't use the app; otherwise its `message` is the server's
  error.
- The full types, with their documentation comments, are in [`src/server.ts`](../src/server.ts) and
  [`src/servers.ts`](../src/servers.ts).
