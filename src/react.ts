// React bindings over the view context. `ctx.path` is a push model — a live getter plus
// `onPathChange` — which React cannot see, so a view that wants to re-render on
// navigation has to wire the callback into state itself. These do it once: the path
// becomes state, and a file's text becomes state keyed on the path it was read from.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { hostContext } from "./client";
import type { Room } from "./context";
import type { CurrentUser, FileEncoding, FileEntry, Peer } from "./protocol";

/** The signed-in user, re-rendering when the desktop auth state changes. */
export function useCurrentUser(): CurrentUser | null {
  const ctx = hostContext();
  return useSyncExternalStore(ctx.onCurrentUserChange, () => ctx.currentUser);
}

/** The opened node's path, re-rendering the view whenever the user navigates. */
export function usePath(): string {
  const ctx = hostContext();
  return useSyncExternalStore(ctx.onPathChange, () => ctx.path);
}

/**
 * Join the room `name` while the view is mounted, and leave it on unmount or when `name`
 * changes. `peers` re-renders as people join, leave or change presence, and is empty until
 * the room is joined. Presence set before then is sent once it is. `setPresence` is stable
 * across renders.
 */
export function useRoom<Presence = unknown>(
  name: string
): {
  peers: readonly Peer<Presence>[];
  setPresence: (presence: Presence | null) => void;
} {
  const ctx = hostContext();
  const [joined, setJoined] = useState<{
    name: string;
    peers: readonly Peer<Presence>[];
  } | null>(null);
  const room = useRef<Room<Presence> | null>(null);
  // Presence set before the join lands is sent once it does.
  const presence = useRef<{ value: Presence | null } | null>(null);

  useEffect(() => {
    let live = true;
    let joinedRoom: Room<Presence> | undefined;
    void ctx.multiplayer.joinRoom<Presence>(name).then((next) => {
      joinedRoom = next;
      if (!live) return next.leave();
      room.current = next;
      if (presence.current) next.setPresence(presence.current.value);
      setJoined({ name, peers: next.peers });
      next.onPeersChange((peers) => setJoined({ name, peers }));
    });
    return () => {
      live = false;
      if (room.current === joinedRoom) room.current = null;
      joinedRoom?.leave();
    };
  }, [ctx, name]);

  const setPresence = useCallback((value: Presence | null) => {
    presence.current = { value };
    room.current?.setPresence(value);
  }, []);

  return { peers: joined?.name === name ? joined.peers : [], setPresence };
}

/**
 * The contents of the file at `path`, or `null` until its first read lands. Defaults to
 * UTF-8 text; pass `"binary"` for the raw bytes of content a text decode would corrupt (an
 * image, a PDF) — see `useFileObjectUrl` to render those. Re-reads when `path` changes and
 * whenever the file changes on disk, including the view's own writes. Never returns another
 * path's value: navigation reads as `null`, not the file just left.
 */
export function useFile(path: string): string | null;
export function useFile(path: string, encoding: "utf-8"): string | null;
export function useFile(
  path: string,
  encoding: "binary"
): Uint8Array<ArrayBuffer> | null;
export function useFile(
  path: string,
  encoding: FileEncoding = "utf-8"
): string | Uint8Array<ArrayBuffer> | null {
  const ctx = hostContext();
  const [loaded, setLoaded] = useState<{
    path: string;
    value: string | Uint8Array<ArrayBuffer>;
  } | null>(null);

  useEffect(() => {
    let live = true;
    const read = () =>
      void ctx.files.read(path, encoding).then((value) => {
        if (live) setLoaded({ path, value });
      });
    read();
    const offWatch = ctx.files.watch(path, read);
    return () => {
      live = false;
      offWatch();
    };
  }, [ctx, path, encoding]);

  return loaded?.path === path ? loaded.value : null;
}

/** The folder's immediate entries, or `null` until the first listing lands. Re-lists when an entry is added or removed. */
export function useFolder(path: string): FileEntry[] | null {
  const ctx = hostContext();
  const [loaded, setLoaded] = useState<{ path: string; entries: FileEntry[] } | null>(
    null
  );

  useEffect(() => {
    let live = true;
    let request = 0;
    const list = () => {
      const current = ++request;
      void ctx.files.list(path).then((entries) => {
        if (live && current === request) setLoaded({ path, entries });
      });
    };
    const offWatch = ctx.files.watch(path, (change) => {
      if (change.type === "changed") return;
      const child = path ? change.path.slice(path.length + 1) : change.path;
      if (change.path === path || (child && !child.includes("/"))) list();
    });
    list();
    return () => {
      live = false;
      offWatch();
    };
  }, [ctx, path]);

  return loaded?.path === path ? loaded.entries : null;
}

/**
 * An object URL for the file at `path`, or `null` until its first read lands — for binary
 * content `useFile` would corrupt, so `<img src={useFileObjectUrl(path)} />` renders a library
 * image. Pass `type` to set the blob's MIME type when the consumer needs one. Tracks the
 * file like `useFile`, and revokes each URL it replaces so a long-lived view doesn't leak.
 */
export function useFileObjectUrl(path: string, type?: string): string | null {
  const bytes = useFile(path, "binary");
  // The URL is an allocated resource, not a derived value, so it lives in an effect that
  // also frees it. Tag it with the bytes it was minted from so the return never surfaces a
  // URL for the previous file (or one the cleanup already revoked).
  const [tagged, setTagged] = useState<{
    bytes: Uint8Array<ArrayBuffer>;
    url: string;
  } | null>(null);

  useEffect(() => {
    if (!bytes) return;
    const url = URL.createObjectURL(new Blob([bytes], type ? { type } : undefined));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL can only be minted here, paired with the revoke it returns
    setTagged({ bytes, url });
    return () => URL.revokeObjectURL(url);
  }, [bytes, type]);

  return tagged?.bytes === bytes ? tagged.url : null;
}
