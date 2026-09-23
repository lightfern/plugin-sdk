import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HostPushMessage, RpcRequest, RpcResponse } from "./protocol";

// `connect()` memoizes its handshake in module scope, so each test loads a fresh copy.
beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// The host end of the transferred port: answers files.read out of `disk`, and `push`
// replays a host-initiated message (a new path, a disk change) back to the client.
function fakeHost(disk: Record<string, string>) {
  const port = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    start() {},
    postMessage(request: RpcRequest) {
      const { path } = request.params as { path: string };
      const response: RpcResponse = { id: request.id, ok: true, result: disk[path] };
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
      context: { pluginId: "deck", path },
    },
  });
  Object.defineProperty(init, "ports", { value: [port] });
  window.dispatchEvent(init);
  await context;
}

describe("the React bindings", () => {
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
});
