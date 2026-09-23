// What a running view receives from the host. Every path here is relative to the
// activation root (POSIX, `""` = the root itself); the host never hands the plugin
// an absolute filesystem path, and every operation is brokered and permission-checked
// on the other side of the RPC channel.

import type { CurrentUser, FileChange, FileEncoding, FileEntry } from "./protocol";

export interface FileWriteOptions {
  /**
   * Overwrite an existing file at the path. Defaults to `false`: writing to a path
   * already taken by a file rejects instead of clobbering it. Set `true` to replace
   * the file's contents. Creating a file at a free path works either way.
   */
  overwrite?: boolean;
}

export interface FilesApi {
  /**
   * Read a file by its path relative to the activation root. Defaults to UTF-8 text; pass
   * `"binary"` for the raw bytes of content a text decode would corrupt (an image, a PDF) —
   * wrap those in a `Blob` for an `<img>`, or let `useFileObjectUrl` do it. Requires `files.read`.
   */
  read(path: string): Promise<string>;
  read(path: string, encoding: "utf-8"): Promise<string>;
  read(path: string, encoding: "binary"): Promise<Uint8Array<ArrayBuffer>>;
  read(path: string, encoding: FileEncoding): Promise<string | Uint8Array<ArrayBuffer>>;
  /**
   * Write a file by its path relative to the activation root, creating it and any missing
   * parent folders. A string is written as UTF-8 text; pass a `Uint8Array` for binary
   * content — an image or PDF fetched from a permitted origin, e.g.
   * `new Uint8Array(await res.arrayBuffer())` — never a decoded string, which corrupts the
   * bytes. By default (`overwrite: false`) a path already taken by a file rejects; pass
   * `{ overwrite: true }` to replace its contents. Requires `files.write`.
   */
  write(
    path: string,
    content: string | Uint8Array,
    options?: FileWriteOptions
  ): Promise<void>;
  /** List a folder's entries by its path relative to the activation root ("" = the root). Requires `files.read`. */
  list(path: string): Promise<FileEntry[]>;
  /**
   * Move (or rename) the node at `from` to `to`, both relative to the activation root.
   * A rename is a move within the same folder. Missing parent folders of `to` are
   * created; a name already taken by a different node rejects. Requires `files.write`.
   */
  move(from: string, to: string): Promise<void>;
  /**
   * Delete the file or folder at `path` relative to the activation root. Folders are
   * removed with their contents. Deleting a path that doesn't exist is a no-op.
   * Requires `files.write`.
   */
  delete(path: string): Promise<void>;
  /**
   * Watch `path` (relative to the activation root, `""` = the root) for on-disk changes
   * made outside this view — the agent, another view, or the user editing the file. A
   * file path fires only for that file; a folder path fires for anything in its subtree,
   * including a descendant file's content changing. The listener receives the specific
   * `FileChange`; re-read from it to refresh. Your own writes come back as a `changed`,
   * so re-reading is safe but writing back unconditionally will loop. Returns an
   * unsubscribe. Requires `files.read`.
   */
  watch(path: string, listener: (change: FileChange) => void): () => void;
}

export interface ViewContext {
  readonly pluginId: string;
  /** The signed-in Lightfern user, or `null` while signed out. Updates with the host's auth state. */
  readonly currentUser: CurrentUser | null;
  /** Subscribe to sign-in, sign-out, or user changes. Returns an unsubscribe. */
  onCurrentUserChange(listener: (user: CurrentUser | null) => void): () => void;
  /**
   * The opened node's path relative to the activation root: the file for a file view,
   * the folder for a folder view. A live value, not a snapshot — Lightfern keeps the view
   * mounted whenever the newly opened node routes to this same entry module, and updates
   * this in place, so read it fresh each time and subscribe with `onPathChange`.
   */
  readonly path: string;
  /**
   * The plugin's own folder — where its `manifest.json` lives — relative to the activation
   * root, and the target that opens its `home` view. Constant for the life of the view (it
   * does not move as `path` does), so `ctx.open(ctx.homePath)` navigates back to the home
   * from any file view without the plugin having to know its own folder name.
   */
  readonly homePath: string;
  readonly files: FilesApi;
  /**
   * Open a node in the workspace by its path relative to the activation root — the host
   * routes to a file's view (or reveals a folder in the tree) exactly as a click in the
   * library would. Pass `newTab` to open in a new tab instead of replacing the active
   * one. The path may not escape the activation root. Needs no permission.
   */
  open(path: string, newTab?: boolean): Promise<void>;
  /**
   * Call `listener` with the new `path` when the user opens another node that routes to
   * this view — including one matched by a different contribution, as long as it is the
   * same entry module in the same activation folder. The view stays mounted and the
   * iframe does not reload, so state and in-flight animations survive. Only a different
   * entry module or activation folder replaces the view, and that arrives as a fresh
   * `connect()` rather than here. Returns an unsubscribe.
   */
  onPathChange(listener: (path: string) => void): () => void;
}
