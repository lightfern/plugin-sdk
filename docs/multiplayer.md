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

Use presence for what a person is doing now. Use files for the work itself.

- **Seeing who's where.** Avatars on the cards, rows or pages people have open, and a list of who's
  in the app. Two people on the same deal in a CRM, or the same candidate in a tracker, see each
  other before they both start editing it.
- **Avoiding collisions.** "Alice is editing this candidate" shows before Alice saves, so Bob waits
  instead of writing over her. Presence carries what someone is editing, and the view warns or holds
  off. It's a courtesy, not a lock: if both save, the files still merge.
- **Work in progress, before it's saved.** A card someone is dragging moves on everyone's screen as
  they drag it. A stroke on a shared whiteboard or battle map appears as it's drawn. A measurement
  or selection shows while it's being made. When the person lets go, the view writes the result to a
  file.
- **Following someone.** A presenter's current slide, the region of the map a game master has
  revealed, the step a teacher is on. Everyone else's view follows the leader's presence.
- **Pointers and cursors** on a canvas, map or diagram, updated up to 60 times a second.
- **Light realtime games.** A card game, chess, or a small arcade game for a few friends. Each
  player's presence is their state, and the view builds the game from everyone's. It isn't a game
  server: nothing referees, so a player can cheat, and fast reaction games won't feel right.

Don't use presence for anything that must still be there when everyone has left: votes, scores, a
game you want to resume, comments, decisions. Those go in files, which also reach people who aren't
in the app at the time.

## Joining a room

In React, `useRoom` joins while the view is mounted and leaves when it unmounts:

```tsx
import { useRoom } from "lightfern:host/react";

type Presence = { card: string | null };

function Board() {
  const { peers, setPresence } = useRoom<Presence>("board");
  // Call setPresence({ card }) when the user opens a card, and setPresence({ card: null }) on close.
  const viewers = (card: string) => peers.filter((peer) => peer.presence?.card === card);
  // …
}
```

Without React, `ctx.multiplayer.joinRoom(name)` returns a room with `peers`, `setPresence`,
`onPeersChange` and `leave`.

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
