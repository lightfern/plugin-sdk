# Multiplayer

A **room** lets people use your app together: they see who else is there, where their cursors are
and what they're dragging, and their changes go through one shared copy of your server code, in one
order. Use rooms for boards people work on together, games, and anything where people should see
each other.

## How it works

- A room is a class that extends `Room` from `lightfern:server`, joined by name. Everyone with
  access to your app who joins the same class with the same name is in the same room. That's the
  app's owner and everyone it's shared with.
- The room's server code runs once, for everyone, one event at a time. When two people make a move
  at the same moment, one goes first and the other sees its result.
- A **view** is one window, tab or device with your app open. Each view joins rooms separately.
- Each view has one **presence**: a small JSON value your app sets, like `{ "card": "card-3" }`.
  Presence is for what's happening now, and is never saved.
- A **peer** is a person in the room: one per person, however many views they have open.
- What should still be there later, like a moved card, a vote or a score, goes to a file, through
  the room's methods.

## Example

```ts
// src/board.server.ts
import { type Caller, query, Room } from "lightfern:server";

type Cards = Record<string, string>; // card ID → column

export class Board extends Room {
  // Each board is a file named for its room.
  get #file() {
    return `boards/${this.ctx.roomName}.json`;
  }

  cards = query(async (_caller: Caller) => {
    return JSON.parse(await this.ctx.files.read(this.#file)) as Cards;
  });

  async move(_caller: Caller, card: string, column: string) {
    const board = JSON.parse(await this.ctx.files.read(this.#file)) as Cards;
    board[card] = column;
    await this.ctx.files.write(this.#file, JSON.stringify(board), { overwrite: true });
  }
}
```

```tsx
// src/home.tsx
import { useRoom, useQuery } from "lightfern:host/react";

import { Board } from "./board.server";

type Presence = { dragging: string | null };

function Columns() {
  const board = useRoom<Board, Presence>(Board, "main");
  const cards = useQuery(board.cards);

  const drop = async (card: string, column: string) => {
    try {
      await board.move(card, column);
    } finally {
      board.client.setPresence({ dragging: null });
    }
  };

  // Draw `cards`, and an avatar on each card someone else is dragging:
  // board.client.peers.filter((peer) => peer.presence?.dragging === id)
}
```

While Bob drags a card, his presence says which one, so Alice sees it move. When he drops it, `move`
saves the board, the `cards` query runs again for everyone, and Bob clears his drag. Alice sees the
card land, then Bob's drag end.

## Presence and calls

Clear the presence a call replaces only once the call has finished: `await` the method, then set
presence, as `drop` does above. A call finishes only after everyone's queries have the new result,
so others see the card land before the drag ends. Clearing first makes the card jump back for a
moment for everyone else.

## Joining a room

```ts
// From "lightfern:host"
function room<T extends Room, Presence = unknown>(
  cls: new () => T,
  name: string
): RoomHandle<T, Presence>;

// From "lightfern:host/react": no `connect()` needed
function useRoom<T extends Room, Presence = unknown>(
  cls: new () => T,
  name: string
): RoomHandle<T, Presence>;
```

- `room(Cls, name)` returns straight away and joins in the background. Calls wait until the view is
  in. You're in the room, and in everyone's `peers`, until `client.close()`.
- `useRoom(Cls, name)` is the same handle, re-rendering whenever anything on `client` changes. You
  leave once the last component using it unmounts, unless `room()` opened it too.
- Calling either again with the same class and name in one view gives the same handle.
- The handle has the room's methods and queries, without the caller, and the connection as `client`.
- `name` is 1 to 256 characters.

## Who's in the room

```ts
interface RoomClient<Presence> {
  /** Everyone else in the room. */
  readonly peers: readonly Peer<Presence>[];
  /** You, across all your views in the room; `null` until joined. */
  readonly me: Peer<Presence> | null;
  /** This view's ID, as `caller.viewId` is on the server; `null` until joined. */
  readonly viewId: string | null;
  /** "connecting" | "connected" | "offline" | "refused" */
  readonly status: ServerStatus;
  setPresence(presence: Presence | null): void;
  onPeersChange(listener: (peers: readonly Peer<Presence>[]) => void): () => void;
  onMeChange(listener: (me: Peer<Presence> | null) => void): () => void;
  onStatusChange(listener: (status: ServerStatus) => void): () => void;
  onMessage(listener: (data: unknown) => void): () => void;
  close(): void;
}

interface Peer<Presence> {
  /** The person's user ID, the same as `user.id`. */
  peerId: string;
  user: { id: string; name: string | null; profilePictureUrl: string | null };
  /** The presence of their most recently active view: `views[0].presence`. */
  presence: Presence | null;
  /** Every view they have open in this room, most recently active first. */
  views: readonly PeerView<Presence>[];
}

interface PeerView<Presence> {
  viewId: string;
  presence: Presence | null;
  /** When this view joined or last changed its presence, in milliseconds by the server's clock. */
  activeAt: number;
}
```

- `peers` has one entry per person in the room, except you. Someone with your app open on 2 devices
  appears once, with both views in `views`. It's in no fixed order, so sort it yourself.
- `me` is you, with every view you have open in the room, this one included.
- A peer who hasn't changed keeps the same object, so you can skip them with `===`.
- A view that drops stays listed for 5 seconds. If it reconnects in that time, it comes back as the
  same view, and nobody sees it leave.
- `activeAt` is by the server's clock. Compare it only with other `activeAt` values.
- `status` is `"connected"` while the view is in the room. It's `"connecting"` while it joins or
  reconnects, `"offline"` once the server has been out of reach for 10 seconds, and `"refused"` when
  the person can't use the app or the room turned them away. Use it to tell "nobody else is here"
  from "you are offline".

## Presence

- `setPresence(value)` replaces this view's presence. It reaches everyone else within a fraction of
  a second, at most 20 times a second, always ending with the latest.
- It goes through `JSON.stringify`, so a `Date` arrives as a string and `undefined` fields are
  dropped. It throws if the JSON is over 8 KiB.
- Presence set before the view is in is sent once it is, and again after a reconnect.
- Presence runs no server code and never waits for a call.

Describe where things are, not what happened. `{ dragging: "card-3", over: "done" }` works, but
`{ event: "dropped" }` can be skipped. Positions must mean the same on every screen: use positions
relative to your content, like a fraction of the board's width, not pixels in the window. Keep
presence to IDs, positions and short labels; never put file contents in it.

## Server code in a room

```ts
interface RoomContext {
  readonly files: Files;
  readonly roomName: string;
  /** Everyone in the room, once each with all their views, including the caller. */
  readonly participants: readonly Peer[];
  send(data: unknown): Promise<void>;
  sendTo(viewId: string, data: unknown): Promise<void>;
}
```

- `this.ctx.roomName` is the name the room was joined with. Find the room's files from it, never
  from an argument a view passes, or a view in one room could change another's.
- `this.ctx.participants` lists everyone in the room with their presence: in a call, the caller
  included; in `onJoin`, everyone already there; in `onLeave`, everyone who's still there.
- `this.ctx.send(data)` reaches every view in the room; `this.ctx.sendTo(viewId, data)` reaches one
  view, for something only one person should get on that screen.
- `onJoin(caller)` runs before each view is in the room, once per view: a person on 3 devices joins
  3 times. Check `this.ctx.participants` to see whether they were already here. Messages it sends
  reach everyone already in the room, not the view that's joining; that view reads the room's state
  from a query once it's in.
- `onLeave(caller)` runs once a view has left, 5 seconds after it closed or dropped. The person has
  left entirely when they're no longer in `this.ctx.participants`.

## Who's allowed in

Views choose room names, and a modified view can join any name. So a room whose members matter
checks them in `onJoin`, and throws to keep someone out:

```ts
async onJoin(caller: Caller) {
  const players = JSON.parse(await this.ctx.files.read(`games/${this.ctx.roomName}.json`)).players;
  if (!players.includes(caller.user.id)) throw new UserError("You're not in this game");
}
```

A view that's turned away gets nothing from the room, its status becomes `"refused"`, and its calls
fail with the message. It stays refused: to try again, call `client.close()` and join again. A city
in a game can do the same, so nobody hears about players in other cities.

## Choosing room names

- Use one name, like `"main"`, to put everyone in the app together.
- Use a file's ID to give each file its own room. `ctx.fileId` (or `useFileId()`) is the opened
  file's ID: the same for everyone with access to the file, and the same when the file is renamed or
  moved. A new file's ID can change once, when it first syncs; `useFileId()` re-renders when it
  does. On a [link](guide.md#on-a-link) `ctx.fileId` is `null`, so use the path there instead.
- Use a path to give each session its own room, such as a game on each TV. Declare a view that
  matches `play/*`, start a session by making up a code and calling `ctx.open("play/k7f2")`, and
  join the room `session-k7f2`, read from `ctx.path`. No file needs to exist at that path. Share the
  app on a public link, put `ctx.linkTo("play/k7f2")` in a QR code, and every phone that scans it
  opens the same view and joins the same room. See
  [Routing paths to views](guide.md#routing-paths-to-views).
- Rooms belong to one copy of the app. If someone copies the app's folder, or installs the same app
  themselves, they are in different rooms from the original, even with the same name.

## People and their views

`peers` and `me` group views by person, so showing each person once is the easy default. Each view
still has its own presence, so your app can give one person's devices different jobs.

- **Show each person once.** Draw one avatar or cursor for each peer, from `peer.presence`.
- **Give each device its own job.** Have each view say what it's for in its presence. A card game
  can show its table on a TV, while each player sees their own hand on their phone, signed in to the
  same account. Send each hand only to the views that should show it, with `sendTo` or a query that
  checks the caller.
- **Use a phone as a controller.** A racing game can run on the big screen while a phone steers it.
  The phone sets its controls as presence, like `{ role: "wheel", steer: -0.4, gas: 1 }`, and the
  big screen reads them from `peers` on every frame. The big screen sends back what the phone shows,
  like the speed, in its own presence. Presence reaches the other views at up to 20 updates a second
  and runs no server code, so a room for this needs no methods: an empty
  `class Drive extends Room {}` is enough. Run the game itself in the big screen's view, since
  server code has no timers to step it.
- **Seats and anything else that lasts.** Key them on `user.id`, never on a view's ID, so someone
  who reopens a tab is back in their own seat.
- **The view they're using now** is `me.views[0]`. A view can check
  `me.views[0]?.viewId === client.viewId`, for example to show "Active in another window" in a
  forgotten tab. This is a hint, not a lock.
- **Testing a game alone in two windows.** `peers` is empty, because both windows are you. Treat
  every view as a player while you test: `[...peers, me].flatMap((person) => person.views)`.

## What you can trust

- `peer.user` is the person as the app knows them: its own ID for them, and their name and picture
  only if the share names them (see [Methods](server.md#methods)). The room's `caller` is who really
  made a call.
- `peer.presence` is whatever their copy of your app sent. Check its shape before you use it, in
  views and in server code.
- Never render presence as HTML.
- People who can read the app's files can read everything in them, so a room can't hide anything
  from them there: a hidden hand of cards in a file is only hidden from the screen. See
  [Keeping an app secure](server.md#keeping-an-app-secure).
- To show `profilePictureUrl`, add its origin to `network_permissions`.
