// `lightfern:server`: what an app's server code imports. An app lists its server modules under
// `contributes.servers` in its manifest. Each exports a class that extends `Server` (a private
// server, joined with no name) or `Room` (a shared room, joined by name). Views join them with
// `join` from `lightfern:host`.
//
// Everything Lightfern provides is on `this.ctx`, which is protected, so a view can never reach it
// and app methods can use any name. Only public methods the app's own class declares can be called
// from views.

import type { FileChange, FileEntry, Peer, PeerUser } from "./protocol";

export type { FileChange, FileEntry, Peer, PeerUser, PeerView } from "./protocol";

/** A person's access to the app's folder. More levels may be added later. */
export type Access = "owner" | "admin" | "edit" | "read" | "public";

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
  /**
   * Hear about changes to a file, or to anything under a folder: the server's `onFileChange` runs
   * for each one. Watching a path twice is one watch. Watches end with `unwatch`, when a private
   * server's view closes, or when a room empties.
   */
  watch(path: string): Promise<void>;
  /** Stop watching a path passed to `watch`. Unknown paths are ignored. */
  unwatch(path: string): Promise<void>;
}

export interface ServerContext {
  /**
   * Who made the call in progress. In a room's `onJoin` and `onLeave`, the view that joined or
   * left. `null` in `onStart` and `onFileChange`, where nobody did.
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
  readonly name: string;
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

/**
 * Server code. Extend it directly for a private server, or extend `Room` for a shared one.
 *
 * A private server is joined with no name and serves one view: it knows nothing about anyone else
 * using the app. Lightfern may unload it about 10 seconds after its last call, and fields on the
 * class are lost then, so keep anything that lasts in files. Changes other people make reach it
 * through `onFileChange`.
 */
export abstract class Server {
  declare protected readonly ctx: ServerContext;

  /** Runs each time the server starts, including after it was unloaded. Watch files here. */
  protected onStart?(): void | Promise<void>;

  /**
   * A watched file changed. Runs straight away for this server's own writes, and once the change
   * syncs for edits made anywhere else, such as an agent editing the file on disk.
   */
  protected onFileChange?(change: FileChange): void | Promise<void>;
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
   */
  protected onJoin?(): void | Promise<void>;

  /**
   * A view left the room, 5 seconds after it closed or dropped. `ctx.caller` is that view. The
   * person has left entirely when they're no longer in `ctx.peers`.
   */
  protected onLeave?(): void | Promise<void>;
}
