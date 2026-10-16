# Multiplayer

Multiplayer lets everyone using a shared app see each other live. Each person in a room sets a small
JSON value, their **presence**, and everyone else gets it within a fraction of a second, along with
who sent it. Presence is never saved and disappears when the person leaves. Use it for what people
are doing right now, like cursors, selections or a drag in progress, and use files for anything that
should last.

It needs the `multiplayer` permission.

```tsx
import { useRoom } from "lightfern:host/react";

function Board() {
  const { peers, setPresence } = useRoom<{ card: string | null }>("board");
  // setPresence({ card }) as the user opens a card; peers[i].presence.card is what others have open.
}
```

Without React, `ctx.multiplayer.joinRoom(name)` returns a room with `peers`, `setPresence`,
`onPeersChange` and `leave`.

- **Who's in a room:** everyone who holds the app and joins the same name, on each of their devices.
  A copy of the app has rooms of its own. Use a file's path as the name for a room per file.
- **Presence:** any JSON up to 8 KiB, latest value wins, sent at most 60 times a second, so values
  in between may be dropped.
- **Identity:** `peer.user` comes from Lightfern's server, so nobody can appear as someone else. The
  presence value is whatever their plugin sent, so check it before you use it.
- **Offline or signed out:** the room has nobody else in it until Lightfern can connect.
