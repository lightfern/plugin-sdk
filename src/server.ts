// `lightfern:server`: what an app's server code imports. An app lists its server modules under
// `contributes.servers` in its manifest. Each exports a class that extends `Server` (a private
// server, one per view) or `Room` (a shared room, joined by name). Views reach them through
// `server` and `room` from `lightfern:host`.
//
// Everything Lightfern provides is on `this.ctx`, which is protected, so a view can never reach it
// and app methods can use any name. Only public methods the app's own class declares can be called
// from views.

import type { FileEntry, Peer, PeerUser } from "./protocol";

export type { FileEntry, Peer, PeerUser, PeerView } from "./protocol";

/**
 * A person's access to the app's folder. More levels may be added later.
 *
 * - `edit_code_and_data`: can change the app's code and files directly, without going through
 *   server code.
 * - `read_code_and_data`: can read the app's code and all its files, which sync to their devices,
 *   but changes them only through server code.
 * - `use_only`: can use the app through its views, but their devices don't have its code or files,
 *   so server code can keep things from them. Not given yet.
 */
export type Access =
  "owner" | "admin" | "edit_code_and_data" | "read_code_and_data" | "use_only";

/** Who made the call in progress. Set by Lightfern from the person's sign-in; views can't change it. */
export interface Caller {
  readonly user: PeerUser;
  /** The view the call came from: the same ID as `room.viewId` there, and in its peer's `views`. */
  readonly viewId: string;
  readonly access: Access;
}

/**
 * The app's files, as `ctx.files` was in views before 3.0. Paths are relative to the app's folder.
 * Anything outside it, dot-prefixed, inside an app's code folder, a `manifest.json` or under
 * `node_modules` is refused.
 *
 * Writes, moves and deletes made during a call apply when the method returns, and not at all if it
 * throws. Reads later in the same call see them.
 */
export interface Files {
  read(path: string): Promise<string>;
  read(path: string, encoding: "binary"): Promise<Uint8Array>;
  list(folder: string): Promise<readonly FileEntry[]>;
  write(
    path: string,
    content: string | Uint8Array,
    options?: { overwrite?: boolean }
  ): Promise<void>;
  move(from: string, to: string): Promise<void>;
  delete(path: string): Promise<void>;
}

export interface ServerContext {
  /**
   * Who made the call in progress. In a query, the view that subscribed. In a room's `onJoin` and
   * `onLeave`, the view that joined or left. `null` in `onStart`, where nobody did.
   */
  readonly caller: Caller | null;
  readonly files: Files;
  /**
   * Send `data` to every view connected to this server, through their `onMessage`. Nothing keeps
   * it. A call's messages go out once its file changes are saved, and not at all if it throws. A
   * private server only ever has one view; in a room this reaches everyone, so keep anything
   * private out of it and use `sendTo`.
   */
  send(data: unknown): Promise<void>;
}

export interface RoomContext extends ServerContext {
  /** The name this room was joined with, such as "123abc". */
  readonly roomName: string;
  /** Everyone with a view in the room, once each, in the same shape views get in `room.peers`. */
  readonly peers: readonly Peer[];
  /**
   * Send `data` to one view, for someone's private things like their hand of cards. To reach every
   * view a person has open, loop over their peer's `views`.
   */
  sendTo(viewId: string, data: unknown): Promise<void>;
}

/** An error whose message is shown to the person. Any other error reaches the view as a generic failure. */
export class UserError extends Error {
  override name = "UserError";
}

declare const queryBrand: unique symbol;

/** A live query made with `query`. Only queries can be passed to `useQuery`. */
export type Query<Args extends unknown[], Result> = ((
  ...args: Args
) => Promise<Result>) & {
  readonly [queryBrand]: true;
};

/**
 * Makes a live query, which views subscribe to with `useQuery`. A query only reads: its writes are
 * refused. It runs as the view that subscribed, its results reach only that view, and it runs again
 * whenever a file it read or a folder it listed changes, including edits made anywhere else. Use
 * queries for what views show, and methods for changes.
 *
 * ```ts
 * customers = query(async (stage: string) => {
 *   const entries = await this.ctx.files.list("customers");
 *   …
 * });
 * ```
 */
export function query<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>
): Query<Args, Result> {
  // The runtime looks this up to refuse subscriptions to anything else.
  return Object.defineProperty(fn, Symbol.for("lightfern.query"), {
    value: true,
  }) as Query<Args, Result>;
}

/**
 * Server code. Extend it directly for a private server, or extend `Room` for a shared one.
 *
 * A private server serves one view: it knows nothing about anyone else using the app. Lightfern may
 * unload it about 10 seconds after its last call, and fields on the class are lost then, so keep
 * anything that lasts in files. Changes other people make reach views through queries.
 */
export abstract class Server {
  declare protected readonly ctx: ServerContext;

  /** Runs each time the server starts, including after it was unloaded. */
  protected onStart?(): void | Promise<void>;
}

/**
 * A shared room: everyone who joins the same class with the same name is in the same room. It runs
 * in one place, which decides the order of everything that happens in it, one call at a time.
 * Fields on the class are lost when the room is unloaded, so anything that should last goes in
 * files.
 */
export abstract class Room extends Server {
  declare protected readonly ctx: RoomContext;

  /**
   * A view joined the room. `ctx.caller` is that view. A person with the app open on several
   * devices joins once per device; check `ctx.peers` to see whether they were already here.
   *
   * Throw to refuse the view: it gets the error as a call would, and nothing from the room. Views
   * choose room names, so a room whose members matter checks them here, such as a city refusing
   * players who aren't in it.
   */
  protected onJoin?(): void | Promise<void>;

  /**
   * A view left the room, 5 seconds after it closed or dropped. `ctx.caller` is that view. The
   * person has left entirely when they're no longer in `ctx.peers`.
   */
  protected onLeave?(): void | Promise<void>;
}
