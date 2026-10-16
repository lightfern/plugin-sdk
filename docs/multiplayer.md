# Multiplayer

With the `multiplayer` permission, your plugin can show people what everyone else in the same app is
doing right now: who has which card open, where their cursor is, what they're dragging.

## How it works

- A **room** is a named channel in your app. Your plugin chooses the name.
- Everyone with access to your app who joins the same room name is in the same room. That's the
  app's owner and everyone it's shared with.
- Each person in a room has one **presence**: a small JSON value your plugin sets, like
  `{ "card": "card-3" }`.
- Everyone else in the room is a **peer**. You get each peer's presence, name and picture within a
  fraction of a second of it changing.
- A **view** is one open tab of your plugin. Each view joins rooms separately.
- Presence is never saved. A peer's presence goes when they leave.

Use presence for what is happening now. Save anything that should still be there later, like a moved
card, a vote or a comment, to a file.

## Example

```tsx
import { useEffect } from "react";
import { useRoom } from "lightfern:host/react";

type Presence = { card: string | null };

function Board({ openCard }: { openCard: string | null }) {
  const { peers, setPresence } = useRoom<Presence>("board");
  useEffect(() => setPresence({ card: openCard }), [openCard, setPresence]);

  const viewersOf = (card: string) => peers.filter((peer) => peer.presence?.card === card);
  // Render each card with an avatar for everyone in viewersOf(card.id).
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
  readonly peers: readonly Peer<Presence>[];
  setPresence(presence: Presence | null): void;
  onPeersChange(listener: (peers: readonly Peer<Presence>[]) => void): () => void;
  leave(): void;
}

interface Peer<Presence> {
  peerId: string;
  user: { id: string; name: string | null; profilePictureUrl: string | null };
  presence: Presence | null;
}

// From "lightfern:host/react"
function useRoom<Presence = unknown>(
  name: string
): { peers: readonly Peer<Presence>[]; setPresence: (presence: Presence | null) => void };
```

### `joinRoom(name)`

- Rejects if the manifest does not have the `multiplayer` permission.
- Rejects if `name` is empty or longer than 256 characters.
- Works when the person is offline, signed out, or the app has not synced yet. The room has no peers
  until Lightfern can reach the server.
- Has no peers in the public share viewer, or in screenshots Lightfern's assistant takes.
- Joining the same name twice in one view gives you the same room and the same presence.

### `peers`

- Everyone in the room except this view.
- In no fixed order. Sort it yourself, for example by name.
- Lists each view separately. Someone with your app open on 2 devices, or in 2 tabs, appears twice
  with the same `user.id`. Group by `user.id` to show each person once.
- Keeps someone for up to 30 seconds if they lose their connection without leaving.
- Does not include you. Use `ctx.currentUser` for that.

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

### `useRoom(name)`

- Joins when the component mounts, and leaves when it unmounts or `name` changes.
- Returns `peers`, which is empty until the room is joined.
- Returns `setPresence`, which is the same function on every render.
- Sends presence you set before the room is joined once it is.

## Writing good presence

Describe where things are, not what happened. `{ dragging: "card-3", over: "done" }` works, but
`{ event: "dropped" }` can be skipped. Save events that matter to a file.

Positions must mean the same thing on every screen. Use positions relative to your content, like a
fraction of the board's width and height, not pixels in the window.

Keep presence to IDs, positions and short labels. Never put file contents in it.

## Choosing room names

- Use one name, like `"board"`, to put everyone in the app together.
- Use a file's path to give each file its own room. Paths are the same for everyone with access to
  the app.
- Renaming a file gives it a new room.
- Rooms belong to one copy of the app. If someone copies the app's folder, or installs the same
  plugin themselves, they are in different rooms from the original, even with the same name.

## What you can trust

- `peer.user` is the name and picture on the person's Lightfern account.
- `peer.presence` is whatever their copy of your plugin sent. Check its shape before you use it.
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
