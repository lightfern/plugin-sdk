# Multiplayer

Multiplayer lets everyone using a shared app see each other live. Each person in a room sets a small
JSON value, their **presence**, and everyone else gets it within a fraction of a second, along with
who sent it. Presence is never saved and disappears when the person leaves. Use it for what people
are doing right now, like cursors, selections or a drag in progress, and use files for anything that
should last.

It needs the `multiplayer` permission.

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

## Rules

- **Who's in a room:** everyone who holds the app and joins the same name, on each of their devices.
  A copy of the app has rooms of its own. Use a file's path as the name for a room per file.
- **Presence:** any JSON up to 8 KiB, latest value wins, sent at most 60 times a second, so values
  in between may be dropped.
- **Identity:** `peer.user` comes from Lightfern's server, so nobody can appear as someone else. The
  presence value is whatever their plugin sent, so check it before you use it. Showing a
  `profilePictureUrl` needs its origin in `network_permissions`.
- **Offline or signed out:** the room has nobody else in it until Lightfern can connect, then
  `onPeersChange` fires as people appear.
