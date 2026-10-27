# Multiplayer

With the `multiplayer` permission, your app can show people what everyone else in the same app is
doing right now: who has which card open, where their cursor is, what they're dragging.

## How it works

- A **room** is a named channel in your app. Your app chooses the name.
- Everyone with access to your app who joins the same room name is in the same room. That's the
  app's owner and everyone it's shared with.
- Each person in a room has one **presence**: a small JSON value your app sets, like
  `{ "card": "card-3" }`.
- A **view** is one window, tab or device with your app open. Each view joins rooms separately and
  has its own presence.
- Everyone else in the room is a **peer**: one per person, however many views they have open. You
  get each peer's presence, name and picture within a fraction of a second of it changing.
- **`me`** is you, across every view you have open in the room, this one included.
- Presence is never saved. A peer's presence goes when they leave.

Use presence for what is happening now. Save anything that should still be there later, like a moved
card, a vote or a comment, to a file.

## Example

Each hook takes the room name and re-renders only for its own part of the room, so a component that
only sets presence never re-renders, and a status badge doesn't re-render when cursors move.

```tsx
import { useEffect } from "react";
import { useConnected, usePeers, useSetPresence } from "lightfern:host/react";

type Presence = { card: string | null };

function Status() {
  return useConnected("board") ? null : <span>Offline</span>;
}

function Card({ id, open }: { id: string; open: boolean }) {
  const setPresence = useSetPresence<Presence>("board");
  useEffect(() => {
    if (open) setPresence({ card: id });
  }, [id, open, setPresence]);

  const viewers = usePeers<Presence>("board").filter((peer) => peer.presence?.card === id);
  // Render the card with an avatar for each viewer.
}
```

Without React:

```ts
const room = await ctx.multiplayer.joinRoom<Presence>("board");
room.setPresence({ card: "card-3" });
drawViewers(room.peers);
const stop = room.onPeersChange(drawViewers);

// When the view no longer needs the room:
stop();
room.leave();
```

## Reference

```ts
ctx.multiplayer.joinRoom<Presence = unknown>(name: string): Promise<Room<Presence>>;

interface Room<Presence> {
  /** One entry per other person in the room. */
  readonly peers: readonly Peer<Presence>[];
  /** You, across all your views, including this one. */
  readonly me: Peer<Presence>;
  /** This view's ID, so you can find it in `me.views`. */
  readonly viewId: string;
  readonly connected: boolean;
  setPresence(presence: Presence | null): void;
  onPeersChange(listener: (peers: readonly Peer<Presence>[]) => void): () => void;
  onMeChange(listener: (me: Peer<Presence>) => void): () => void;
  onConnectedChange(listener: (connected: boolean) => void): () => void;
  leave(): void;
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

// From "lightfern:host/react"
function useConnected(name: string): boolean;
function usePeers<Presence = unknown>(name: string): readonly Peer<Presence>[];
function useMe<Presence = unknown>(name: string): Peer<Presence> | null;
function useViewId(name: string): string | null;
function useSetPresence<Presence = unknown>(name: string): (presence: Presence | null) => void;
```

### `joinRoom(name)`

- Rejects if the manifest does not have the `multiplayer` permission.
- Rejects if `name` is empty or longer than 256 characters.
- Works when the person is offline, signed out, or the app has not synced yet. The room is not
  connected and has no peers until Lightfern can reach the server.
- Has no peers in the public share viewer, or in screenshots Lightfern's assistant takes.
- Joining the same name twice in one view gives you the same room and the same presence.

### `peers`

- One entry per person in the room, except you. Someone with your app open on 2 devices, or in 2
  tabs, appears once, with both views in `views`.
- In no fixed order. Sort it yourself, for example by name.
- A peer's `presence` is the presence of their most recently active view.
- Keeps a view for 5 seconds after it leaves, and for up to 30 seconds if it loses its connection
  without leaving. A person goes only once all their views have.
- Does not include you, even your other views. Use `me` for those.

### `me`, `viewId` and `onMeChange(listener)`

- `me` is you, with every view you have open in the room in `me.views`, this one included.
- `viewId` is this view's ID, so you can find it in `me.views`.
- `onMeChange` runs when one of your views joins, leaves or changes its presence, and returns a
  function that stops it.
- While you're signed out, `me.user.id` is `""` and `me.views` holds only this view.

### `views` and `activeAt`

- A view is most recently active when it joined or set its presence last. Lightfern's server keeps
  the time, so devices with wrong clocks still sort correctly.
- `activeAt` is in milliseconds by the server's clock. Compare it only with other `activeAt` values,
  never with `Date.now()`.
- This view's own `activeAt` is `0` until the server has seen it.

### `connected` and `onConnectedChange(listener)`

- `connected` is `true` while this view is connected to the room, so it gets peers and sends your
  presence.
- It is `false` while the person is offline or signed out, before the app has synced, and while
  Lightfern reconnects.
- It is always `false` in the public share viewer and in screenshots Lightfern's assistant takes.
- Use it to tell "nobody else is here" from "you are offline".
- `onConnectedChange` runs when it changes, and returns a function that stops it.

### `onPeersChange(listener)`

- Runs when someone joins, leaves or changes their presence.
- Runs at most 60 times a second, and not at all if nothing changed.
- Gives you the same object for a peer who has not changed, so you can skip them with `===`.
- Returns a function that stops it.

### `setPresence(value)`

- Replaces your presence. Only the latest value is sure to reach your peers.
- Is sent at most 60 times a second.
- Goes through `JSON.stringify`, so a `Date` arrives as a string and `undefined` fields are dropped.
- Throws if the JSON is over 8 KiB.
- Is kept if you set it before the room connects, and sent again after a reconnect.
- Cannot be read back. Keep your own copy if you need it.

### `leave()`

- Takes this view out of the room straight away.
- Happens automatically for every room when the view closes.

### React hooks

- Every hook in a view that uses the same name shares one room. The room is joined when the first of
  them mounts and left when the last one unmounts.
- A component can use as many room names as it needs, like `"board"` and a file's ID.
- `useConnected(name)` re-renders only when the connection changes. It is `false` until the room is
  joined and connected.
- `usePeers(name)` re-renders only when a peer joins, leaves or changes. It is empty until the room
  is joined. Wrap each peer's component in `React.memo` so only the peer who changed re-renders.
- `useMe(name)` re-renders only when one of your views joins, leaves or changes. It is `null` until
  the room is joined.
- `useViewId(name)` is this view's ID in the room, or `null` until the room is joined.
- `useSetPresence(name)` never re-renders. It returns the same function on every render, and
  presence you set before the room is joined is sent once it is.

## One person, several views

People open apps in more than one place: a second window, a phone next to the laptop, a tab they
forgot about yesterday. Every view keeps working fully. Each can set presence and save files,
whether or not it's the one they're using now.

- **Seats and anything else that lasts.** Key them on `user.id`, never on a view's ID. Then someone
  who reopens a tab, or reconnects, is back in their own seat.
- **The view they're using now.** It's `me.views[0]`. A view can check
  `room.me.views[0]?.viewId === room.viewId`, for example to show "Active in another window" in a
  forgotten tab. This is a hint, not a lock: never stop a view working because it isn't first.
- **A board on a TV with a phone as the remote.** Both views are yours, so the board finds the phone
  in `me.views`, not in `peers`. Have the phone set presence like `{ "role": "remote" }`, and the
  board read it from there.
- **Testing a game alone in two windows.** `peers` is empty, because both windows are you. Treat
  every view as a player while you test:

  ```ts
  const players = [...room.peers, room.me].flatMap((person) => person.views);
  ```

## Writing good presence

Describe where things are, not what happened. `{ dragging: "card-3", over: "done" }` works, but
`{ event: "dropped" }` can be skipped. Save events that matter to a file.

Positions must mean the same thing on every screen. Use positions relative to your content, like a
fraction of the board's width and height, not pixels in the window.

Keep presence to IDs, positions and short labels. Never put file contents in it.

## Choosing room names

- Use one name, like `"board"`, to put everyone in the app together.
- Use a file's ID to give each file its own room. `ctx.fileId` (or `useFileId()`) is the opened
  file's ID. It is the same for everyone with access to the file, and stays the same when the file
  is renamed or moved.
- A new file's ID can change once, when it first syncs. `useFileId()` re-renders when it does, so a
  room named by it follows.
- Rooms belong to one copy of the app. If someone copies the app's folder, or installs the same app
  themselves, they are in different rooms from the original, even with the same name.

## What you can trust

- `peer.user` is the name and picture on the person's Lightfern account.
- `peer.presence` is whatever their copy of your app sent. Check its shape before you use it.
- Never render presence as HTML.
- To show `profilePictureUrl`, add its origin to `network_permissions`.

## Presence and files together

Most features use both. While Bob drags a card, his presence says which card and where it is, so
Alice sees it move. When he drops it, his view saves the board file. Alice's view hears about the
save through `ctx.files.watch` once it syncs, usually a few seconds later. Until then, keep showing
the card where Bob's presence last put it.

If 2 people save the same file at the same time, Lightfern merges JSON and CSV by structure. Keep
each item under its own key or in its own row, and changes to different items are both kept. If 2
people change the same value, the last save to sync wins.
