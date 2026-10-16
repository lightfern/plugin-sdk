# Multiplayer

When someone shares an app, everyone who holds it works on the same files, and sync merges their
edits. That covers what people make together. It doesn't cover what they're doing right now: which
card someone has open, where their pointer is, what they're halfway through dragging. Files arrive
in seconds and keep everything; this needs to arrive in a fraction of a second and disappear when
the person leaves.

Multiplayer is that second channel. Everyone using the same app can join a room, and each person in
it publishes a small piece of live state, their **presence**, which everyone else sees as it
changes, labelled with who they are. It needs the `multiplayer` permission in the manifest.

## When to use it

Use presence for what people are doing right now: who has which card or page open, a cursor, a drag
or drawing in progress, a presenter's current slide, or the moves in a light game for a few friends
(nothing referees it, so players can cheat). Anything that should still be there after everyone
leaves, like votes, scores or comments, goes in files.

## The API

```ts
ctx.multiplayer.joinRoom<Presence = unknown>(name: string): Promise<Room<Presence>>;

interface Room<Presence> {
  /** Everyone else in the room, including your own other devices. Never includes this view. */
  readonly peers: readonly Peer<Presence>[];
  /** Replace your presence for everyone else. Throws if the JSON is over 8 KiB. */
  setPresence(presence: Presence | null): void;
  /** Called with the new `peers` whenever someone joins, leaves or changes presence. Returns an unsubscribe. */
  onPeersChange(listener: (peers: readonly Peer<Presence>[]) => void): () => void;
  /** Leave the room. Closing the view leaves every room it joined. */
  leave(): void;
}

interface Peer<Presence> {
  /** One connection: the same person on two devices is two peers with the same `user.id`. */
  peerId: string;
  user: PeerUser;
  /** `null` until they set one. */
  presence: Presence | null;
}

interface PeerUser {
  id: string;
  name: string | null;
  profilePictureUrl: string | null;
}
```

`joinRoom` rejects only when the manifest lacks the `multiplayer` permission. `peers` can start
empty while the connection opens, so render it once and again on every `onPeersChange`.

```ts
import type { Peer } from "lightfern:host";

type Presence = { card: string | null };

const room = await ctx.multiplayer.joinRoom<Presence>("board");
const render = (peers: readonly Peer<Presence>[]) => {
  for (const peer of peers) showAvatar(peer.user, peer.presence?.card);
};
render(room.peers);
const stop = room.onPeersChange(render);

room.setPresence({ card: "card-3" }); // the user opened a card
room.setPresence({ card: null }); // and closed it

stop();
room.leave();
```

In React, `useRoom(name)` joins while the component is mounted and leaves when it unmounts:

```tsx
import { useRoom } from "lightfern:host/react";

const { peers, setPresence } = useRoom<Presence>("board");
// peers: readonly Peer<Presence>[], empty until the join lands
// setPresence: (presence: Presence | null) => void, ignored until the join lands
```

## Rooms

**Who's in a room.** Everyone who holds the app's folder and joins the same name: the owner, the
people it's shared with (readers included), and each of their devices. A copy of the app is a
different app with rooms of its own.

**Naming rooms.** Name a room after what it's about. One name for the whole app (`"board"`) puts
everyone together. A file's path gives each file its own room, because paths relative to the app are
the same for everyone who holds it. Renaming the file moves anyone who reopens it into a new room.

**Your own devices.** If you have the app open on two machines, each shows up in the other's `peers`
with your `user.id`. Group by `user.id` to show each person once.

**Offline and signed out.** The room just has nobody else in it, and fills up once Lightfern can
connect. The view needs no separate offline path.

## Presence is state, not messages

Each person has one presence value, and setting it replaces the last one. It's sent at most 60 times
a second, so values in between may never reach anyone. Describe where things are, not what happened:
`{ dragging: "card-3", x: 120, y: 48 }` works, `{ event: "dropped" }` can be lost. An event that
matters, like a drop or a move in a game, goes in a file.

- A presence value is any JSON up to 8 KiB. Keep it to IDs, coordinates and short labels, never file
  contents.
- It's `null` until the person sets one, and it's gone as soon as they leave or close the view.
- Someone who joins late sees everyone's current presence and nothing from before.

## Who someone is, and what to trust

`peer.user` (`id`, `name`, `profilePictureUrl`) comes from Lightfern's server and the person's
sign-in, so nobody can appear as someone else. The presence value is whatever that person's copy of
the plugin sent. Treat it as input: check its shape before you use it, and never render it as HTML.
Showing a `profilePictureUrl` needs its origin in `network_permissions`.

## Presence and files together

Most features use both: presence while something is in progress, a file for the result. When Bob
drags a card, his presence carries the card and where it is, so Alice sees it move. When he drops
it, his view writes the board file. Alice's view gets that write through `ctx.files.watch` once it
syncs, which takes seconds, so keep showing the card where Bob's presence last put it until the file
catches up.

Two people can write the same file at once. Lightfern merges JSON and CSV by structure, so keep each
item under its own key or in its own row: two people moving different cards both land, and when two
people change the same value, the last to sync wins.
