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
  RpcMethod,
  RpcRequest,
  RpcResponse,
  SerializableContext,
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
  let user = context.user;
  const pathListeners = new Set<(path: string) => void>();
  const userListeners = new Set<(user: CurrentUser | null) => void>();
  const watchers = new Set<{ path: string; listener: (change: FileChange) => void }>();
  const rooms = new Map<string, (peers: Peer[]) => void>();

  const call = openChannel(port, (push) => {
    if (push.type === "path") {
      path = push.path;
      for (const listener of pathListeners) listener(path);
    } else if (push.type === "multiplayer.peers") {
      rooms.get(push.room)?.(push.peers);
    } else if (push.type === "user") {
      user = push.user;
      for (const listener of userListeners) listener(user);
    } else {
      for (const change of push.changes) {
        for (const watcher of watchers) {
          if (pathCovers(watcher.path, change.path)) watcher.listener(change);
        }
      }
    }
  });

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
    const joined = (await call("multiplayer.join", { name })) as MultiplayerJoinResult;
    let peers = joined.peers as Peer<Presence>[];
    const listeners = new Set<(peers: readonly Peer<Presence>[]) => void>();
    rooms.set(joined.room, (next) => {
      peers = next as Peer<Presence>[];
      for (const listener of listeners) listener(peers);
    });
    return {
      get peers() {
        return peers;
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

// A watcher fires when its path is the changed node or an ancestor folder of it; `""`
// (the activation root) covers everything.
function pathCovers(watched: string, changed: string): boolean {
  const root = watched.replace(/\/+$/, "");
  return root === "" || changed === root || changed.startsWith(`${root}/`);
}

type Call = (method: RpcMethod, params: RpcRequest["params"]) => Promise<unknown>;

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
