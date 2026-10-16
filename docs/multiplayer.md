# Multiplayer

The `multiplayer` permission gives your app a realtime presence API. People using the same app can
see what each other is doing as it happens.

Each person sets a small JSON value, called their presence. Everyone else in the room gets it within
a fraction of a second, with who sent it. Presence is not saved. It disappears when the person
leaves.

Use presence for what people are doing now. For example, who has a card open, a cursor, a drag in
progress, a presenter's current slide or the moves in a simple game. Nothing checks the moves, so
players can cheat. Save anything that should last, like votes, scores or comments, in files.

## The API

```ts
ctx.multiplayer.joinRoom<Presence = unknown>(name: string): Promise<Room<Presence>>;

interface Room<Presence> {
  /**
   * Everyone else in the room, including your own other devices. Never includes this view.
   * A peer whose user and presence haven't changed keeps the same object, so compare with `===`.
   */
  readonly peers: readonly Peer<Presence>[];
  /** Replace your presence for everyone else. Throws if the JSON is over 8 KiB. */
  setPresence(presence: Presence | null): void;
  /**
   * Called with the new `peers` when someone joins, leaves or changes presence, at most once a
   * frame. Returns an unsubscribe.
   */
  onPeersChange(listener: (peers: readonly Peer<Presence>[]) => void): () => void;
  /** Leave the room. Closing the view leaves every room it joined. */
  leave(): void;
}

interface Peer<Presence> {
  /** One connection: the same person on two devices is two peers with the same `user.id`. */
  peerId: string;
  user: PeerUser;
  presence: Presence | null;
}

interface PeerUser {
  id: string;
  name: string | null;
  profilePictureUrl: string | null;
}
```

`joinRoom` only fails if the manifest does not have the `multiplayer` permission. `peers` can be
empty while the room connects. Render it once, then again on every `onPeersChange`.

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

In React, `useRoom(name)` joins the room when the component mounts and leaves when it unmounts:

```tsx
import { useRoom } from "lightfern:host/react";

const { peers, setPresence } = useRoom<Presence>("board");
// peers: readonly Peer<Presence>[], empty until the join lands
// setPresence: (presence: Presence | null) => void, ignored until the join lands
```

## Rooms

People who join the same room name in the same app see each other's presence. This includes everyone
the app is shared with. Someone with the app open on 2 devices, or in 2 views, appears as 2 peers
with the same `user.id`. Group by `user.id` to show each person once.

Rooms belong to one copy of the app. Someone with a separate copy, even with the same plugin code,
joins different rooms. For example, if you copy an app folder, or install a plugin yourself instead
of opening the one shared with you, nobody from the original app sees you.

Name a room after what it's about. Use one name, like `"board"`, for the whole app. Use a file's
path to give each file its own room, because paths are the same for everyone who has the app. If
someone renames the file, people who reopen it join a new room.

When someone is offline or signed out, their room has nobody else in it. It fills up when Lightfern
connects. You do not need to handle this separately.

## Presence is state, not messages

Each person has one presence value. Setting it replaces the old one. Lightfern sends it at most 60
times a second, so some values in between are never sent.

Describe where things are, not what happened. `{ dragging: "card-3", x: 120, y: 48 }` works.
`{ event: "dropped" }` can get lost. Save events that matter, like a drop or a game move, in a file.

- Presence can be any JSON up to 8 KiB. Keep it to IDs, coordinates and short labels.
- Presence is `null` until the person sets it, and disappears when they leave or close the view.
- Someone who joins late sees everyone's current presence, but nothing from before.

## Trust

`peer.user` comes from Lightfern's server. Nobody can pretend to be someone else.

`peer.presence` is whatever the other person's plugin sent. Check its shape before you use it. Never
render it as HTML.

To show a `profilePictureUrl`, add its origin to `network_permissions`.

## Using presence with files

Most features use both. Use presence while something is happening, and a file for the result.

For example, Bob drags a card. His presence holds the card and its position, so Alice sees it move.
When Bob drops it, his view saves the board file. Alice's view gets the change through
`ctx.files.watch` after it syncs, which takes a few seconds. Keep showing the card where Bob's
presence last put it until the file arrives.

Two people can save the same file at the same time. Lightfern merges JSON and CSV by structure. Keep
each item under its own key or in its own row. If 2 people move different cards, both changes are
kept. If they change the same value, the last one to sync wins.
