import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FileEntry, HostPushMessage, RpcRequest, RpcResponse } from "./protocol";

// `connect()` memoizes its handshake in module scope, so each test loads a fresh copy.
beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// The host end of the transferred port: answers reads and listings, and `push`
// replays a host-initiated message (a new path, a disk change) back to the client.
function fakeHost(
  disk: Record<string, string>,
  folders: Record<string, FileEntry[]> = {}
) {
  const port = {
    sent: [] as RpcRequest[],
    onmessage: null as ((event: MessageEvent) => void) | null,
    start() {},
    postMessage(request: RpcRequest) {
      port.sent.push(request);
      const { path, name } = request.params as { path: string; name: string };
      const response: RpcResponse = {
        id: request.id,
        ok: true,
        result:
          request.method === "multiplayer.join"
            ? { room: name, peers: [], connected: false }
            : request.method === "files.list"
              ? folders[path]
              : disk[path],
      };
      queueMicrotask(() => port.onmessage?.({ data: response } as MessageEvent));
    },
    push(message: HostPushMessage) {
      port.onmessage?.({ data: message } as MessageEvent);
    },
  };
  return port;
}

async function connectTo(port: ReturnType<typeof fakeHost>, path: string) {
  const { connect } = await import("./client");
  const ready = new Promise<void>((resolve) => {
    window.addEventListener("message", () => resolve(), { once: true });
  });
  const context = connect();
  await ready;

  const init = new MessageEvent("message", {
    data: {
      source: "lf-plugin-host",
      type: "init",
      context: { pluginId: "deck", path, fileId: null, homePath: "deck", user: null },
    },
  });
  Object.defineProperty(init, "ports", { value: [port] });
  window.dispatchEvent(init);
  await context;
}

describe("the React bindings", () => {
  it("re-renders the current user on sign-in and sign-out", async () => {
    const port = fakeHost({});
    await connectTo(port, "deck");
    const { useCurrentUser } = await import("./react");

    function View() {
      return <span>{useCurrentUser()?.name ?? "Signed out"}</span>;
    }

    render(<View />);
    expect(screen.getByText("Signed out")).toBeDefined();
    await act(async () => {
      port.push({
        source: "lf-plugin-host",
        type: "user",
        user: {
          id: "user-1",
          name: "Ada Lovelace",
          email: "ada@example.com",
          profilePictureUrl: null,
        },
      });
    });
    expect(screen.getByText("Ada Lovelace")).toBeDefined();
    await act(async () => {
      port.push({ source: "lf-plugin-host", type: "user", user: null });
    });
    expect(screen.getByText("Signed out")).toBeDefined();
  });

  it("re-renders the open file's text on navigation, and never shows the previous file's", async () => {
    const port = fakeHost({
      "Lightfern.md": "# Lightfern",
      "Golden Gate Bridge.md": "# Golden Gate",
    });
    await connectTo(port, "Lightfern.md");
    const { usePath, useFile } = await import("./react");

    function View() {
      const path = usePath();
      return <pre>{useFile(path) ?? `loading ${path}`}</pre>;
    }

    render(<View />);
    expect(await screen.findByText("# Lightfern")).toBeDefined();

    await act(async () => {
      port.push({
        source: "lf-plugin-host",
        type: "path",
        path: "Golden Gate Bridge.md",
        fileId: null,
      });
    });

    expect(screen.queryByText("# Lightfern")).toBeNull();
    expect(await screen.findByText("# Golden Gate")).toBeDefined();
  });

  it("re-reads the open file when it changes on disk", async () => {
    const disk = { "Lightfern.md": "first" };
    const port = fakeHost(disk);
    await connectTo(port, "Lightfern.md");
    const { useFile } = await import("./react");

    const View = () => <pre>{useFile("Lightfern.md")}</pre>;
    render(<View />);
    expect(await screen.findByText("first")).toBeDefined();

    disk["Lightfern.md"] = "second";
    await act(async () => {
      port.push({
        source: "lf-plugin-host",
        type: "files.change",
        changes: [{ type: "changed", path: "Lightfern.md" }],
      });
    });

    expect(await screen.findByText("second")).toBeDefined();
  });

  it("keeps a folder's immediate entries in sync without re-listing on content changes", async () => {
    const folders: Record<string, FileEntry[]> = {
      candidates: [{ path: "candidates/ada.md", name: "ada.md", kind: "file" }],
      archive: [{ path: "archive/grace.md", name: "grace.md", kind: "file" }],
    };
    const port = fakeHost({}, folders);
    const postMessage = vi.spyOn(port, "postMessage");
    await connectTo(port, "deck");
    const { useFolder } = await import("./react");

    function View({ path }: { path: string }) {
      const entries = useFolder(path);
      return <span>{entries?.map((entry) => entry.name).join(", ") ?? "loading"}</span>;
    }

    const { rerender } = render(<View path="candidates" />);
    expect(screen.getByText("loading")).toBeDefined();
    expect(await screen.findByText("ada.md")).toBeDefined();

    await act(async () => {
      port.push({
        source: "lf-plugin-host",
        type: "files.change",
        changes: [
          { type: "changed", path: "candidates/ada.md" },
          { type: "created", path: "candidates/subfolder/nested.md" },
        ],
      });
    });
    expect(postMessage).toHaveBeenCalledTimes(1);

    folders.candidates = [
      ...folders.candidates,
      { path: "candidates/lin.md", name: "lin.md", kind: "file" },
    ];
    await act(async () => {
      port.push({
        source: "lf-plugin-host",
        type: "files.change",
        changes: [{ type: "created", path: "candidates/lin.md" }],
      });
    });
    expect(await screen.findByText("ada.md, lin.md")).toBeDefined();

    folders.candidates = folders.candidates.filter((entry) => entry.name !== "ada.md");
    await act(async () => {
      port.push({
        source: "lf-plugin-host",
        type: "files.change",
        changes: [{ type: "deleted", path: "candidates/ada.md" }],
      });
    });
    expect(await screen.findByText("lin.md")).toBeDefined();

    rerender(<View path="archive" />);
    expect(screen.getByText("loading")).toBeDefined();
    expect(await screen.findByText("grace.md")).toBeDefined();
  });

  it("gives a binary file an object URL and revokes it when the view unmounts", async () => {
    const created: string[] = [];
    const revoked: string[] = [];
    let next = 0;
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
      const url = `blob:mock/${next++}`;
      created.push(url);
      return url;
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation((url) => {
      revoked.push(url as string);
    });

    const port = {
      onmessage: null as ((event: MessageEvent) => void) | null,
      start() {},
      postMessage(request: RpcRequest) {
        const response: RpcResponse = {
          id: request.id,
          ok: true,
          result: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
        };
        queueMicrotask(() => port.onmessage?.({ data: response } as MessageEvent));
      },
      push() {},
    };
    await connectTo(port as unknown as ReturnType<typeof fakeHost>, "cover.png");
    const { useFileObjectUrl } = await import("./react");

    const View = () => <span>{useFileObjectUrl("cover.png") ?? "loading"}</span>;
    const { unmount } = render(<View />);
    expect(await screen.findByText("blob:mock/0")).toBeDefined();

    act(() => unmount());
    expect(created).toEqual(["blob:mock/0"]);
    expect(revoked).toEqual(["blob:mock/0"]);
  });

  it("re-renders the file ID once the file syncs", async () => {
    const port = fakeHost({});
    await connectTo(port, "notes.md");
    const { useFileId } = await import("./react");

    const View = () => <span>{useFileId() ?? "unsynced"}</span>;
    render(<View />);
    expect(screen.getByText("unsynced")).toBeDefined();

    await act(async () => {
      port.push({
        source: "lf-plugin-host",
        type: "path",
        path: "notes.md",
        fileId: "f-1",
      });
    });
    expect(screen.getByText("f-1")).toBeDefined();
  });

  const roomPush = (connected: boolean, names: string[]) => ({
    source: "lf-plugin-host" as const,
    type: "multiplayer.room" as const,
    room: "board",
    peers: names.map((name) => ({
      peerId: name,
      user: { id: name, name, profilePictureUrl: null },
      presence: null,
    })),
    connected,
  });

  it("re-renders only the hooks whose part of the room changed", async () => {
    const port = fakeHost({});
    await connectTo(port, "board");
    const { useConnected, usePeers } = await import("./react");
    const renders = { status: 0, peers: 0 };

    function Status() {
      renders.status += 1;
      return <span>{useConnected("board") ? "online" : "offline"}</span>;
    }
    function Peers() {
      renders.peers += 1;
      return (
        <span>
          {usePeers("board")
            .map((peer) => peer.user.name)
            .join(", ") || "alone"}
        </span>
      );
    }

    render(
      <>
        <Status />
        <Peers />
      </>
    );
    // Pushes only reach a room once its join has landed.
    await waitFor(() =>
      expect(port.sent.map((r) => r.method)).toContain("multiplayer.join")
    );
    await act(async () => {});
    await act(async () => port.push(roomPush(true, [])));
    expect(screen.getByText("online")).toBeDefined();
    const before = { ...renders };

    await act(async () => port.push(roomPush(true, ["Ada"])));

    expect(screen.getByText("Ada")).toBeDefined();
    expect(renders.status).toBe(before.status);
    expect(renders.peers).toBe(before.peers + 1);
  });

  it("sends presence set on mount once the room is joined", async () => {
    const port = fakeHost({});
    await connectTo(port, "board");
    const { useSetPresence } = await import("./react");
    const { useEffect } = await import("react");

    function View() {
      const setPresence = useSetPresence<{ card: string }>("board");
      useEffect(() => setPresence({ card: "a" }), [setPresence]);
      return null;
    }

    render(<View />);
    await waitFor(() =>
      expect(port.sent).toContainEqual(
        expect.objectContaining({
          method: "multiplayer.setPresence",
          params: { room: "board", presence: { card: "a" } },
        })
      )
    );
  });

  it("joins each room once per view, and leaves it when its last hook unmounts", async () => {
    const port = fakeHost({});
    await connectTo(port, "board");
    const { useConnected, usePeers } = await import("./react");
    const methods = () => port.sent.map((request) => request.method);

    function Board() {
      useConnected("board");
      usePeers("board");
      return null;
    }
    function Cards() {
      usePeers("cards");
      return null;
    }
    const View = ({ cards }: { cards: boolean }) => (
      <>
        <Board />
        {cards && <Cards />}
      </>
    );

    const { rerender, unmount } = render(<View cards />);
    await waitFor(() =>
      expect(methods().filter((method) => method === "multiplayer.join")).toHaveLength(
        2
      )
    );

    rerender(<View cards={false} />);
    await waitFor(() => expect(methods()).toContain("multiplayer.leave"));
    unmount();
    await waitFor(() =>
      expect(methods().filter((method) => method === "multiplayer.leave")).toHaveLength(
        2
      )
    );
  });
});
