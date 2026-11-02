import type { FilesApi, Room, ViewContext } from "./context";
import { MAX_PRESENCE_BYTES } from "./context";
import type {
  CurrentUser,
  FileChange,
  FileEncoding,
  FileEntry,
  HostInitMessage,
  HostPushMessage,
  MultiplayerJoinResult,
  Peer,
  RoomChangedMessage,
  RpcMethod,
  RpcRequest,
  RpcResponse,
  SerializableContext,
  ServerPushMessage,
  ViewReadyMessage,
} from "./protocol";

export class PluginRpcError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "PluginRpcError";
    this.code = code;
  }
}

let connectPromise: Promise<ViewContext> | null = null;
let connected: ViewContext | null = null;
let hostCall: Call | null = null;
let onServerPush: ((push: ServerPushMessage) => void) | null = null;

/**
 * Complete the host handshake and resolve the view's context. Idempotent — repeated
 * calls return the same promise, so a plugin can call it from anywhere without
 * coordinating a single entry point.
 */
export function connect(): Promise<ViewContext> {
  connectPromise ??= new Promise<ViewContext>((resolve) => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as HostInitMessage | undefined;
      if (data?.source !== "lf-plugin-host" || data.type !== "init") return;
      const port = event.ports[0];
      if (!port) return;
      window.removeEventListener("message", onMessage);
      connected = createContext(data.context, port);
      resolve(connected);
    };
    window.addEventListener("message", onMessage);
    const ready: ViewReadyMessage = { source: "lf-plugin-view", type: "ready" };
    // Address the ready ping to the concrete host origin where the platform exposes it
    // (Chromium/Electron, our only host); fall back to any origin elsewhere. The ping
    // carries no secrets — the capability transfer is the host-sent MessagePort, which
    // the host only hands over after verifying the message came from this iframe.
    const hostOrigin = window.location.ancestorOrigins?.[0] ?? "*";
    window.parent.postMessage(ready, hostOrigin);
  });
  return connectPromise;
}

/** For `server` and `room`: connects, routes `server.*` pushes to `onPush`, and returns the port. */
export async function serverChannel(
  onPush: (push: ServerPushMessage) => void
): Promise<Call> {
  onServerPush = onPush;
  await connect();
  return hostCall!;
}

/**
 * The connected context, for the React bindings — they take no arguments, so they read
 * it here. Throws if the view renders before `connect()` resolves, which is what a
 * forgotten `await` looks like.
 */
export function hostContext(): ViewContext {
  if (!connected) throw new Error("await connect() before rendering the view");
  return connected;
}

function createContext(context: SerializableContext, port: MessagePort): ViewContext {
  let path = context.path;
  let fileId = context.fileId;
  let user = context.user;
  const pathListeners = new Set<(path: string) => void>();
  const userListeners = new Set<(user: CurrentUser | null) => void>();
  const watchers = new Set<{ path: string; listener: (change: FileChange) => void }>();
  const rooms = new Map<string, (push: RoomChangedMessage) => void>();

  const call = openChannel(port, (push) => {
    if (push.type.startsWith("server.")) {
      onServerPush?.(push as ServerPushMessage);
    } else if (push.type === "path") {
      path = push.path;
      fileId = push.fileId;
      for (const listener of pathListeners) listener(path);
    } else if (push.type === "multiplayer.room") {
      rooms.get(push.room)?.(push);
    } else if (push.type === "user") {
      user = push.user;
      for (const listener of userListeners) listener(user);
    } else if (push.type === "files.change") {
      for (const change of push.changes) {
        for (const watcher of watchers) {
          if (pathCovers(watcher.path, change.path)) watcher.listener(change);
        }
      }
    }
  });
  hostCall = call;

  const files: FilesApi = {
    read: ((path: string, encoding?: FileEncoding) =>
      call("files.read", { path, encoding })) as FilesApi["read"],
    write: async (path, content, options) => {
      await call("files.write", { path, content, overwrite: options?.overwrite });
    },
    list: (path) => call("files.list", { path }) as Promise<FileEntry[]>,
    move: async (from, to) => {
      await call("files.move", { from, to });
    },
    delete: async (path) => {
      await call("files.delete", { path });
    },
    watch: (watchPath, listener) => {
      const watcher = { path: watchPath, listener };
      watchers.add(watcher);
      return () => {
        watchers.delete(watcher);
      };
    },
  };

  async function joinRoom<Presence>(name: string): Promise<Room<Presence>> {
    if (!name || name.length > 256) {
      throw new PluginRpcError("A room name must be 1 to 256 characters");
    }
    const joined = (await call("multiplayer.join", { name })) as MultiplayerJoinResult;
    let peers: readonly Peer<Presence>[] = joined.peers as Peer<Presence>[];
    let me = joined.me as Peer<Presence>;
    let connected = joined.connected;
    const listeners = new Set<(peers: readonly Peer<Presence>[]) => void>();
    const meListeners = new Set<(me: Peer<Presence>) => void>();
    const connectedListeners = new Set<(connected: boolean) => void>();
    rooms.set(joined.room, (push) => {
      if (push.connected !== connected) {
        connected = push.connected;
        for (const listener of connectedListeners) listener(connected);
      }
      if (JSON.stringify(push.me) !== JSON.stringify(me)) {
        me = push.me as Peer<Presence>;
        for (const listener of meListeners) listener(me);
      }
      const kept = keepUnchanged(peers, push.peers as Peer<Presence>[]);
      if (kept === peers) return;
      peers = kept;
      for (const listener of listeners) listener(peers);
    });
    return {
      get peers() {
        return peers;
      },
      get me() {
        return me;
      },
      viewId: joined.viewId,
      get connected() {
        return connected;
      },
      setPresence: (presence) => {
        const bytes = new TextEncoder().encode(JSON.stringify(presence)).length;
        if (bytes > MAX_PRESENCE_BYTES) {
          throw new PluginRpcError(`Presence is ${bytes} bytes; the limit is 8 KiB`);
        }
        void call("multiplayer.setPresence", { room: joined.room, presence });
      },
      onPeersChange: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      onMeChange: (listener) => {
        meListeners.add(listener);
        return () => {
          meListeners.delete(listener);
        };
      },
      onConnectedChange: (listener) => {
        connectedListeners.add(listener);
        return () => {
          connectedListeners.delete(listener);
        };
      },
      leave: () => {
        if (!rooms.delete(joined.room)) return;
        void call("multiplayer.leave", { room: joined.room });
      },
    };
  }

  return {
    pluginId: context.pluginId,
    get currentUser() {
      return user;
    },
    onCurrentUserChange: (listener) => {
      userListeners.add(listener);
      return () => userListeners.delete(listener);
    },
    get path() {
      return path;
    },
    homePath: context.homePath,
    get fileId() {
      return fileId;
    },
    files,
    multiplayer: { joinRoom },
    open: async (openPath, newTab) => {
      await call("open", { path: openPath, newTab });
    },
    onPathChange: (listener) => {
      pathListeners.add(listener);
      return () => {
        pathListeners.delete(listener);
      };
    },
  };
}

// An unchanged person keeps their object, so a view can skip it with `===`. Returns `before` itself
// when nothing changed.
export function keepUnchanged<P extends { user: { id: string } }>(
  before: readonly P[],
  after: P[]
): readonly P[] {
  const old = new Map(before.map((peer) => [peer.user.id, peer]));
  const kept = after.map((peer) => {
    const was = old.get(peer.user.id);
    return was && JSON.stringify(was) === JSON.stringify(peer) ? was : peer;
  });
  return kept.length === before.length && kept.every((peer, i) => peer === before[i])
    ? before
    : kept;
}

// A watcher fires when its path is the changed node or an ancestor folder of it; `""`
// (the activation root) covers everything.
function pathCovers(watched: string, changed: string): boolean {
  const root = watched.replace(/\/+$/, "");
  return root === "" || changed === root || changed.startsWith(`${root}/`);
}

export type Call = (
  method: RpcMethod,
  params: RpcRequest["params"]
) => Promise<unknown>;

// Multiplex the one port: correlate RpcResponses back to their callers by `id`, and
// route the host's pushes (which carry `source`, not `id`) to `onPush`.
function openChannel(port: MessagePort, onPush: (push: HostPushMessage) => void): Call {
  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason: unknown) => void }
  >();

  port.onmessage = (event: MessageEvent) => {
    const data = event.data as RpcResponse | HostPushMessage;
    if ("source" in data) {
      onPush(data);
      return;
    }
    const entry = pending.get(data.id);
    if (!entry) return;
    pending.delete(data.id);
    if (data.ok) entry.resolve(data.result);
    else entry.reject(new PluginRpcError(data.error.message, data.error.code));
  };
  port.start();

  return (method, params) =>
    new Promise<unknown>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      port.postMessage({ id, method, params } satisfies RpcRequest);
    });
}
