// `server` and `room`: how a view reaches its app's server code, from manifest 3.0. The desktop
// holds the connection, so a handle sends requests over the host port and hears pushes back.

import { type Call, keepUnchanged, PluginRpcError, serverChannel } from "./client";
import { MAX_PRESENCE_BYTES } from "./context";
import type {
  Participant,
  RpcMethod,
  RpcRequest,
  ServerPushMessage,
  ServerStatus,
} from "./protocol";
import type { Query, Room as RoomClass, Server as ServerClass } from "./server";

/** What `plugin-build` puts in place of a server class in views, under `Symbol.for("lightfern.server")`. */
export interface ServerStub {
  name: string;
  room: boolean;
  /** Public methods, other than queries. */
  methods: string[];
  /** Fields made with `query`. */
  queries: string[];
}

/** A method of server code, called from a view. */
export type Method<Args extends unknown[], Result> = (...args: Args) => Promise<Result>;

/** A query of server code: called once like a method, or subscribed to. */
export type QueryMethod<Args extends unknown[], Result> = Method<Args, Result> & {
  /**
   * `onResult` runs with the result, then again each time it changes, until the returned function
   * is called. `onError` runs when the query throws. In React, use `useQuery`.
   */
  subscribe(
    args: Args,
    onResult: (result: Result) => void,
    onError?: (error: PluginRpcError) => void
  ): () => void;
};

/** The public methods and queries of a server class, as a view calls them. */
export type Methods<T> = {
  [
    K in keyof T as T[K] extends (...args: never[]) => Promise<unknown> ? K : never
  ]: T[K] extends Query<infer Args, infer Result>
    ? QueryMethod<Args, Result>
    : T[K] extends (...args: infer Args) => Promise<infer Result>
      ? Method<Args, Result>
      : never;
};

export interface HandleState {
  /**
   * `"connecting"` until connected and while reconnecting; `"offline"` once the server can't be
   * reached; `"refused"` when the person can't use the app. Messages sent while a view wasn't
   * `"connected"` are lost; queries catch up by themselves.
   */
  readonly status: ServerStatus;
  /** Runs for each message server code sends this view with `send` or `sendTo`. */
  onMessage(listener: (data: unknown) => void): () => void;
  /** Runs when `status` changes, and in a room when `participants`, `me` or `viewId` does. */
  onChange(listener: () => void): () => void;
  /** Disconnects. Calls, queries and listeners on this handle stop working. */
  close(): void;
}

export interface RoomState<Presence> extends HandleState {
  /** This view's ID in the room, as in `ctx.caller.viewId` on the server; `null` until joined. */
  readonly viewId: string | null;
  /**
   * Everyone in the room, including you. An unchanged participant keeps its object, so `===`
   * skips it.
   */
  readonly participants: readonly Participant<Presence>[];
  /** Your own entry in `participants`, across all your views; `null` until joined. */
  readonly me: Participant<Presence> | null;
  /** Share what you're doing now, such as your cursor. Never saved; at most 8 KiB. */
  setPresence(presence: Presence | null): void;
}

export type ServerHandle<T> = Methods<T> & HandleState;
export type RoomHandle<T, Presence = unknown> = Methods<T> & RoomState<Presence>;

export type Constructor<T> = abstract new (...args: never[]) => T;

export interface Live {
  handle: RoomHandle<unknown>;
  revision: number;
  pinned: boolean;
  hooks: number;
  closing?: ReturnType<typeof setTimeout>;
}

const opened = new Map<string, Live>();
const byNumber = new Map<number, (push: ServerPushMessage) => void>();
let channel: Promise<Call> | null = null;
let nextNumber = 1;
const NOBODY: readonly Participant[] = [];

/**
 * This view's private server for `cls`. Synchronous: it connects in the background, and calls
 * wait for it. A call fails with a `PluginRpcError` whose `code` is `"offline"` when the server
 * can't be reached, `"refused"` when the person can't use the app, and `"user"` for a `UserError`.
 * Calling it again with the same class returns the same handle.
 */
export function server<T extends ServerClass>(
  cls: Constructor<T> & (T extends RoomClass ? never : unknown)
): ServerHandle<T> {
  return openHandle(cls, null, true).handle as ServerHandle<T>;
}

/**
 * The room `name` of `cls`, shared by everyone who joins it. Synchronous like `server`. You're in
 * the room, and in everyone's `participants`, from now until `close()`. In React, `useRoom` also
 * leaves when the last component using it unmounts.
 */
export function room<T extends RoomClass, Presence = unknown>(
  cls: Constructor<T>,
  name: string
): RoomHandle<T, Presence> {
  return openHandle(cls, name, true).handle as RoomHandle<T, Presence>;
}

// For `useRoom`: keeps the handle open until the returned function runs and no other hook holds it.
export function holdHandle(live: Live): () => void {
  clearTimeout(live.closing);
  live.hooks += 1;
  return () => {
    live.hooks -= 1;
    // Closed a moment later, so StrictMode's unmount and remount doesn't leave and rejoin.
    live.closing = setTimeout(() => {
      if (live.hooks === 0 && !live.pinned) live.handle.close();
    });
  };
}

// `pinned` handles stay open until `close()`; others close when the last `useRoom` unmounts.
export function openHandle(
  cls: Constructor<unknown>,
  name: string | null,
  pinned: boolean
): Live {
  const stub = (cls as unknown as Record<symbol, ServerStub | undefined>)[
    Symbol.for("lightfern.server")
  ];
  if (!stub)
    throw new Error(`${cls.name} isn't server code listed in contributes.servers`);
  if (stub.room !== (name !== null)) {
    throw new Error(
      `${stub.name} is ${stub.room ? "a room: use room()" : "a private server: use server()"}`
    );
  }
  if (name !== null && (!name || name.length > 256)) {
    throw new PluginRpcError("A room name must be 1 to 256 characters");
  }
  const key = JSON.stringify([stub.name, name]);
  const existing = opened.get(key);
  if (existing) {
    existing.pinned ||= pinned;
    return existing;
  }

  channel ??= serverChannel((push) => byNumber.get(push.handle)?.(push));
  const number = nextNumber++;
  // Requests go out in the order the app makes them: each waits on the same channel promise.
  const call = (method: RpcMethod, params: Record<string, unknown>) =>
    channel!.then((send) =>
      send(method, { handle: number, ...params } as RpcRequest["params"])
    );
  // The host reports failures to connect through `status`, not on each request.
  const post = (method: RpcMethod, params: Record<string, unknown>) =>
    void call(method, params).catch(() => {});

  let status: ServerStatus = "connecting";
  let viewId: string | null = null;
  let participants: readonly Participant[] = NOBODY;
  let me: Participant | null = null;
  const messageListeners = new Set<(data: unknown) => void>();
  const changeListeners = new Set<() => void>();
  let nextQuery = 1;
  const queries = new Map<
    string,
    {
      query: number;
      latest?: { result: unknown } | { error: PluginRpcError };
      listeners: Set<{
        onResult: (result: unknown) => void;
        onError?: (error: PluginRpcError) => void;
      }>;
    }
  >();
  const queryKeys = new Map<number, string>();

  byNumber.set(number, (push) => {
    if (push.type === "server.message") {
      for (const listener of messageListeners) listener(push.data);
    } else if (push.type === "server.state") {
      const kept = keepUnchanged(participants, push.participants);
      // `me` is your own entry in `participants`, so `participant !== me` finds everyone else.
      const nextMe =
        kept.find((participant) => participant.user.id === push.me?.user.id) ?? null;
      if (
        push.status === status &&
        push.viewId === viewId &&
        kept === participants &&
        nextMe === me
      ) {
        return;
      }
      status = push.status;
      viewId = push.viewId;
      participants = kept;
      me = nextMe;
      live.revision += 1;
      for (const listener of changeListeners) listener();
    } else {
      const entry = queries.get(queryKeys.get(push.query) ?? "");
      if (!entry) return;
      if (push.type === "server.result") {
        entry.latest = { result: push.result };
        for (const listener of entry.listeners) listener.onResult(push.result);
      } else {
        const error = new PluginRpcError(push.error.message, push.error.code);
        entry.latest = { error };
        for (const listener of entry.listeners) listener.onError?.(error);
      }
    }
  });
  post("server.open", { className: stub.name, room: name });

  const subscribe = (
    methodName: string,
    args: unknown[],
    onResult: (result: unknown) => void,
    onError?: (error: PluginRpcError) => void
  ) => {
    const key = JSON.stringify([methodName, args]);
    let entry = queries.get(key);
    if (!entry) {
      entry = { query: nextQuery++, listeners: new Set() };
      queries.set(key, entry);
      queryKeys.set(entry.query, key);
      post("server.subscribe", { query: entry.query, method: methodName, args });
    }
    const listener = { onResult, onError };
    entry.listeners.add(listener);
    if (entry.latest && "result" in entry.latest) onResult(entry.latest.result);
    else if (entry.latest) onError?.(entry.latest.error);
    const shared = entry;
    return () => {
      shared.listeners.delete(listener);
      if (shared.listeners.size > 0 || queries.get(key) !== shared) return;
      queries.delete(key);
      queryKeys.delete(shared.query);
      post("server.unsubscribe", { query: shared.query });
    };
  };

  const handle = {
    get status() {
      return status;
    },
    get viewId() {
      return viewId;
    },
    get participants() {
      return participants;
    },
    get me() {
      return me;
    },
    setPresence: (presence) => {
      const bytes = new TextEncoder().encode(JSON.stringify(presence)).length;
      if (bytes > MAX_PRESENCE_BYTES) {
        throw new PluginRpcError(`Presence is ${bytes} bytes; the limit is 8 KiB`);
      }
      post("server.setPresence", { presence });
    },
    onMessage: (listener) => {
      messageListeners.add(listener);
      return () => messageListeners.delete(listener);
    },
    onChange: (listener) => {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
    close: () => {
      if (opened.get(key) !== live) return;
      opened.delete(key);
      byNumber.delete(number);
      post("server.close", {});
    },
  } satisfies RoomState<unknown> as RoomHandle<unknown>;
  for (const methodName of [...stub.methods, ...stub.queries]) {
    const run = (...args: unknown[]) =>
      call("server.call", { method: methodName, args });
    const value = stub.queries.includes(methodName)
      ? Object.assign(run, {
          subscribe: (
            args: unknown[],
            onResult: (result: unknown) => void,
            onError?: (error: PluginRpcError) => void
          ) => subscribe(methodName, args, onResult, onError),
        })
      : run;
    Object.defineProperty(handle, methodName, { value, enumerable: true });
  }

  const live: Live = { handle, revision: 0, pinned, hooks: 0 };
  opened.set(key, live);
  return live;
}
