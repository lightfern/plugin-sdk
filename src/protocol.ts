// The wire protocol shared by both ends of the plugin bridge. The host (the trusted
// renderer) and the view (the sandboxed iframe) are built from different packages, so
// these message shapes are the single source of truth for what crosses between them.
//
// Handshake: on load the view posts a ViewReadyMessage to its parent, and the host
// replies with a HostInitMessage that transfers a MessagePort. All further traffic is
// RpcRequest/RpcResponse over that port. The port itself is the credential — because a
// sandboxed iframe has an opaque origin, the host cannot be authenticated by
// `event.origin`, so holding the port is what proves the channel.
//
// The port is bidirectional: besides answering the view's requests, the host pushes
// HostPushMessages over it (target changes, disk changes) so a view that stays mounted
// across navigation and external edits can refresh without a reload. A push carries a
// `source` discriminant; an RpcResponse carries a numeric `id` — that is how the view
// tells them apart on the one shared channel.

export interface SerializableContext {
  pluginId: string;
  path: string;
  homePath: string;
  user: CurrentUser | null;
}

export interface CurrentUser {
  id: string;
  name: string | null;
  email: string;
  profilePictureUrl: string | null;
}

export interface ViewReadyMessage {
  source: "lf-plugin-view";
  type: "ready";
}

// A key the view did not claim, forwarded up to the host so app-level shortcuts still
// fire while a plugin view holds focus. A sandboxed iframe's keystrokes never reach the
// host document, so the view posts them across the frame boundary instead. The view only
// forwards a key that no handler in the frame called preventDefault on — calling
// preventDefault is how a plugin keeps a chord for itself. Fields mirror the KeyboardEvent
// so the host can reconstruct the event verbatim.
export interface ViewKeyDownMessage {
  source: "lf-plugin-view";
  type: "keydown";
  key: string;
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

// The view document's live text selection, forwarded up so the composer can pin it as
// context the way it pins a markdown editor's selection. Posted by a host-authored script
// in the view document, not by the plugin: a selection settles (pointer released, or a
// keyboard change) and the trimmed text goes up; `""` means the selection collapsed.
export interface ViewSelectionMessage {
  source: "lf-plugin-view";
  type: "selection";
  text: string;
}

// The user asked the host to fix something shown in the view — today, the "Fix this"
// button on the build-error page. `text` is the detail the composer should act on (the
// build errors). Posted by a host-authored script, like the selection forwarder: the
// build-error document runs no plugin code, so this is the host talking to itself across
// the frame boundary.
export interface ViewFixRequestMessage {
  source: "lf-plugin-view";
  type: "fix";
  text: string;
}

// Everything the view posts up to the host window (not over the port).
export type ViewMessage =
  ViewReadyMessage | ViewKeyDownMessage | ViewSelectionMessage | ViewFixRequestMessage;

// Selection commands the host posts to the view window (not over the port — they are
// answered by the same host-authored script that forwards the selection up, which runs
// before any handshake). `clear` collapses the selection; `reveal` focuses the view and
// scrolls the selection into sight. The script trusts only `event.source === window.parent`.
export interface HostSelectionMessage {
  source: "lf-plugin-host";
  type: "selection.clear" | "selection.reveal";
}

export interface HostInitMessage {
  source: "lf-plugin-host";
  type: "init";
  context: SerializableContext;
}

// The opened node changed while the view stayed mounted (same-view navigation). The
// view should treat `path` as its new `ctx.path` and re-read.
export interface PathChangedMessage {
  source: "lf-plugin-host";
  type: "path";
  path: string;
}

export interface UserChangedMessage {
  source: "lf-plugin-host";
  type: "user";
  user: CurrentUser | null;
}

// One node under the activation root that changed on disk. `path` is relative to the
// activation root. A move or rename is reported as a `deleted` at the old path plus a
// `created` at the new one — the snapshot diff can't pair the two halves. Folders never
// report `changed` (their subtree churn is the children's own events).
export interface FileChange {
  type: "created" | "changed" | "deleted";
  path: string;
}

// A batch of disk changes under the activation root (the agent, another view, or the
// user editing a file). The view fans these to the `ctx.files.watch` listeners whose
// path covers each change. The host also emits a view's own writes as `changed`;
// re-reading in response is safe, writing back unconditionally is not.
export interface FilesChangedMessage {
  source: "lf-plugin-host";
  type: "files.change";
  changes: FileChange[];
}

// Everything the host pushes to a view over the port after the handshake.
export type HostPushMessage =
  PathChangedMessage | FilesChangedMessage | UserChangedMessage;

export type RpcMethod =
  "files.read" | "files.write" | "files.list" | "files.move" | "files.delete" | "open";

// "utf-8" (the default) decodes to a string; "binary" returns the raw bytes untouched,
// for content a text decode would corrupt (an image, a PDF).
export type FileEncoding = "utf-8" | "binary";

export interface FilesReadParams {
  path: string;
  encoding?: FileEncoding;
}

export interface FilesWriteParams {
  path: string;
  // A string is UTF-8 encoded; a Uint8Array is written verbatim, for content a text
  // encode would corrupt (an image, a PDF).
  content: string | Uint8Array;
  // Overwrite an existing file at `path`. Absent means false — the write rejects
  // rather than clobbering a file already there.
  overwrite?: boolean;
}

export interface FilesListParams {
  path: string;
}

export interface FilesMoveParams {
  from: string;
  to: string;
}

export interface FilesDeleteParams {
  path: string;
}

export interface OpenParams {
  /** Path relative to the activation root of the node to open. */
  path: string;
  /** Open in a new tab instead of replacing the active one. */
  newTab?: boolean;
}

export interface FileEntry {
  /** Path relative to the activation root. */
  path: string;
  name: string;
  kind: "file" | "folder";
}

export interface RpcRequest {
  id: number;
  method: RpcMethod;
  params:
    | FilesReadParams
    | FilesWriteParams
    | FilesListParams
    | FilesMoveParams
    | FilesDeleteParams
    | OpenParams;
}

export interface RpcError {
  message: string;
  code?: string;
}

export type RpcResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: RpcError };
