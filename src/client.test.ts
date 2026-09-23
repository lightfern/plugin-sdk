import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FileChange, HostPushMessage, RpcRequest, RpcResponse } from "./protocol";

// `connect()` memoizes its handshake in module scope, so each test loads a fresh copy.
beforeEach(() => {
  vi.resetModules();
});

// A stand-in for the host end of the transferred MessagePort. It answers a fixed set
// of files.* requests so the test exercises the client's request/response correlation
// without a real MessageChannel (jsdom's port transfer is unreliable). `push` replays a
// host-initiated message back through the client's own handler.
function createFakeHostPort(respond: (request: RpcRequest) => RpcResponse) {
  const port = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    start() {},
    postMessage(request: RpcRequest) {
      queueMicrotask(() => {
        port.onmessage?.({ data: respond(request) } as MessageEvent);
      });
    },
    push(message: HostPushMessage) {
      port.onmessage?.({ data: message } as MessageEvent);
    },
  };
  return port;
}

async function connectWithHost(port: ReturnType<typeof createFakeHostPort>) {
  const { connect } = await import("./client");

  const ready = new Promise<void>((resolve) => {
    const onReady = (event: MessageEvent) => {
      if (event.data?.source !== "lf-plugin-view") return;
      window.removeEventListener("message", onReady);
      resolve();
    };
    window.addEventListener("message", onReady);
  });

  const contextPromise = connect();
  await ready;

  const init = new MessageEvent("message", {
    data: {
      source: "lf-plugin-host",
      type: "init",
      context: {
        pluginId: "com.lightfern.csv",
        path: "data.csv",
        homePath: "csv-viewer",
      },
    },
  });
  Object.defineProperty(init, "ports", { value: [port] });
  window.dispatchEvent(init);

  return contextPromise;
}

const noopRespond = (request: RpcRequest): RpcResponse => ({
  id: request.id,
  ok: true,
  result: undefined,
});

describe("connect", () => {
  it("completes the handshake, exposes context, and round-trips file RPC", async () => {
    const { PluginRpcError } = await import("./client");
    const writes: RpcRequest[] = [];
    const port = createFakeHostPort((request): RpcResponse => {
      if (request.method === "files.read") {
        const { path, encoding } = request.params as {
          path: string;
          encoding?: string;
        };
        if (encoding === "binary") {
          return {
            id: request.id,
            ok: true,
            result: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
          };
        }
        if (path === "missing.csv") {
          return {
            id: request.id,
            ok: false,
            error: { message: "not found", code: "ENOENT" },
          };
        }
        return { id: request.id, ok: true, result: "id,name\n1,Ada" };
      }
      writes.push(request);
      return { id: request.id, ok: true, result: undefined };
    });

    const ctx = await connectWithHost(port);

    expect(ctx.pluginId).toBe("com.lightfern.csv");
    expect(ctx.path).toBe("data.csv");
    expect(ctx.homePath).toBe("csv-viewer");

    await expect(ctx.files.read("data.csv")).resolves.toBe("id,name\n1,Ada");
    await expect(ctx.files.read("logo.png", "binary")).resolves.toEqual(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47])
    );

    await ctx.files.write("data.csv", "id,name\n1,Grace");
    expect(writes).toHaveLength(1);
    expect(writes[0].method).toBe("files.write");
    expect(writes[0].params).toEqual({
      path: "data.csv",
      content: "id,name\n1,Grace",
    });

    await ctx.files.write("data.csv", "id,name\n1,Grace", { overwrite: true });
    expect(writes[1].params).toEqual({
      path: "data.csv",
      content: "id,name\n1,Grace",
      overwrite: true,
    });

    await ctx.files.move("data.csv", "people.csv");
    expect(writes[2].method).toBe("files.move");
    expect(writes[2].params).toEqual({ from: "data.csv", to: "people.csv" });

    await ctx.files.delete("people.csv");
    expect(writes[3].method).toBe("files.delete");
    expect(writes[3].params).toEqual({ path: "people.csv" });

    // Binary content passes through as the same Uint8Array, not a decoded string.
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    await ctx.files.write("logo.png", bytes);
    expect(writes[4].method).toBe("files.write");
    expect(writes[4].params).toEqual({ path: "logo.png", content: bytes });

    await expect(ctx.files.read("missing.csv")).rejects.toBeInstanceOf(PluginRpcError);
  });

  it("round-trips ctx.open", async () => {
    const opens: RpcRequest[] = [];
    const port = createFakeHostPort((request): RpcResponse => {
      opens.push(request);
      return { id: request.id, ok: true, result: undefined };
    });

    const ctx = await connectWithHost(port);

    await ctx.open("notes/a.md", true);
    expect(opens).toHaveLength(1);
    expect(opens[0].method).toBe("open");
    expect(opens[0].params).toEqual({ path: "notes/a.md", newTab: true });

    await ctx.open("notes/b.md");
    expect(opens[1].params).toEqual({ path: "notes/b.md", newTab: undefined });
  });

  it("updates path and notifies onPathChange on a host path push", async () => {
    const port = createFakeHostPort(noopRespond);
    const ctx = await connectWithHost(port);

    const seen: string[] = [];
    const off = ctx.onPathChange((next) => seen.push(next));

    port.push({ source: "lf-plugin-host", type: "path", path: "notes.csv" });
    expect(ctx.path).toBe("notes.csv");
    expect(seen).toEqual(["notes.csv"]);

    off();
    port.push({ source: "lf-plugin-host", type: "path", path: "done.csv" });
    expect(seen).toEqual(["notes.csv"]);
    // The live value keeps tracking even without a listener.
    expect(ctx.path).toBe("done.csv");
  });

  it("delivers each covered change to files.watch listeners until unsubscribed", async () => {
    const port = createFakeHostPort(noopRespond);
    const ctx = await connectWithHost(port);

    const seen: FileChange[] = [];
    const off = ctx.files.watch("data.csv", (change) => seen.push(change));

    port.push({
      source: "lf-plugin-host",
      type: "files.change",
      changes: [{ type: "changed", path: "data.csv" }],
    });
    expect(seen).toEqual([{ type: "changed", path: "data.csv" }]);

    off();
    port.push({
      source: "lf-plugin-host",
      type: "files.change",
      changes: [{ type: "deleted", path: "data.csv" }],
    });
    expect(seen).toHaveLength(1);
  });

  it("filters watch by path: a file watcher ignores a sibling, a folder watcher covers its subtree", async () => {
    const port = createFakeHostPort(noopRespond);
    const ctx = await connectWithHost(port);

    const file: FileChange[] = [];
    const folder: FileChange[] = [];
    ctx.files.watch("tasks/a.md", (change) => file.push(change));
    ctx.files.watch("tasks", (change) => folder.push(change));

    port.push({
      source: "lf-plugin-host",
      type: "files.change",
      changes: [
        { type: "changed", path: "tasks/a.md" },
        { type: "created", path: "tasks/b.md" },
        { type: "changed", path: "notes.md" },
      ],
    });

    expect(file).toEqual([{ type: "changed", path: "tasks/a.md" }]);
    expect(folder).toEqual([
      { type: "changed", path: "tasks/a.md" },
      { type: "created", path: "tasks/b.md" },
    ]);
  });
});
