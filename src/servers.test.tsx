import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Peer, RpcRequest, RpcResponse, ServerPushMessage } from "./protocol";
import type { Room } from "./server";
import { Server } from "./server";
import type { Constructor } from "./servers";

// Handles and `connect()` keep state in module scope, so each test loads fresh copies.
beforeEach(() => {
  vi.resetModules();
});

interface CardsRoom extends Room {
  playCard(card: number): Promise<number>;
  hand(): Promise<number[]>;
}

interface CrmServer extends Server {
  customers(stage: string): Promise<string[]>;
}

// What `plugin-build` puts in place of a server class in views.
const stub = (name: string, room: boolean, methods: string[], queries: string[]) =>
  ({ [Symbol.for("lightfern.server")]: { name, room, methods, queries } }) as never;
const Cards: Constructor<CardsRoom> = stub(
  "Cards",
  true,
  ["playCard", "hand"],
  ["hand"]
);
const Crm: Constructor<CrmServer> = stub("Crm", false, ["customers"], ["customers"]);

type Push<M = ServerPushMessage> = M extends unknown ? Omit<M, "source"> : never;

// The host end of the port: records requests, answers calls with `answer`, and `push` sends
// a `server.*` push to the view.
function fakeHost(answer: (request: RpcRequest) => unknown = () => undefined) {
  const port = {
    sent: [] as RpcRequest[],
    onmessage: null as ((event: MessageEvent) => void) | null,
    start() {},
    postMessage(request: RpcRequest) {
      port.sent.push(request);
      let response: RpcResponse;
      try {
        response = { id: request.id, ok: true, result: answer(request) };
      } catch (error) {
        response = {
          id: request.id,
          ok: false,
          error: error as { message: string; code?: string },
        };
      }
      queueMicrotask(() => port.onmessage?.({ data: response } as MessageEvent));
    },
    push(message: Push) {
      port.onmessage?.({
        data: { source: "lf-plugin-host", ...message },
      } as MessageEvent);
    },
    methods: () => port.sent.map((request) => request.method),
  };
  // Answer the view's ready ping with the port, as the desktop does.
  window.addEventListener(
    "message",
    () => {
      const init = new MessageEvent("message", {
        data: {
          source: "lf-plugin-host",
          type: "init",
          context: {
            pluginId: "crm",
            path: "",
            fileId: null,
            homePath: "crm",
            user: null,
          },
        },
      });
      Object.defineProperty(init, "ports", { value: [port] });
      window.dispatchEvent(init);
    },
    { once: true }
  );
  return port;
}

const settle = () => new Promise((resolve) => setTimeout(resolve));

const alice: Peer = {
  peerId: "alice",
  user: { id: "alice", name: "Alice", profilePictureUrl: null },
  presence: null,
  views: [{ viewId: "v-2", presence: null, activeAt: 0 }],
};

describe("server and room", () => {
  it("opens one handle per room and calls its methods", async () => {
    const { room } = await import("./servers");
    const host = fakeHost((request) => {
      const { method, args } = request.params as { method: string; args: unknown[] };
      if (request.method !== "server.call") return undefined;
      if (args[0] === 0) throw { message: "Not your turn", code: "user" };
      return `${method}(${args.join()})`;
    });

    const game = room(Cards, "123abc");
    expect(room(Cards, "123abc")).toBe(game);
    expect(await game.playCard(7)).toBe("playCard(7)");
    await expect(game.playCard(0)).rejects.toMatchObject({
      name: "PluginRpcError",
      message: "Not your turn",
      code: "user",
    });

    expect(host.sent.map((request) => [request.method, request.params])).toEqual([
      ["server.open", { handle: 1, className: "Cards", room: "123abc" }],
      ["server.call", { handle: 1, method: "playCard", args: [7] }],
      ["server.call", { handle: 1, method: "playCard", args: [0] }],
    ]);
  });

  it("refuses a class that isn't server code, or used as the wrong kind", async () => {
    const { room, server } = await import("./servers");
    fakeHost();

    expect(() => server(class extends Server {})).toThrow("isn't server code");
    // @ts-expect-error a room needs `room()`
    expect(() => server(Cards)).toThrow("Cards is a room: use room()");
    // @ts-expect-error a private server needs `server()`
    expect(() => room(Crm, "x")).toThrow("Crm is a private server: use server()");
  });

  it("follows the room's status and people, keeping unchanged peers", async () => {
    const { room } = await import("./servers");
    const host = fakeHost();
    const game = room(Cards, "123abc");
    await settle();
    const changes = vi.fn();
    game.onChange(changes);

    const state = {
      type: "server.state",
      handle: 1,
      viewId: "v-1",
      me: alice,
    } as const;
    host.push({ ...state, status: "connected", peers: [alice] });
    const peers = game.peers;
    host.push({ ...state, status: "connected", peers: [{ ...alice }] });
    host.push({ ...state, status: "offline", peers: [{ ...alice }] });

    expect(changes).toHaveBeenCalledTimes(2);
    expect(game.peers).toBe(peers);
    expect(game).toMatchObject({ status: "offline", viewId: "v-1", me: alice });
  });

  it("shares one subscription for the same query and arguments", async () => {
    const { server } = await import("./servers");
    const host = fakeHost();
    const crm = server(Crm);

    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = crm.customers.subscribe(["lead"], first);
    const stopSecond = crm.customers.subscribe(["lead"], second);
    await settle();
    host.push({ type: "server.result", handle: 1, query: 1, result: ["Acme"] });
    const late = vi.fn();
    const stopLate = crm.customers.subscribe(["lead"], late);

    expect(first).toHaveBeenCalledWith(["Acme"]);
    expect(second).toHaveBeenCalledWith(["Acme"]);
    expect(late).toHaveBeenCalledWith(["Acme"]);

    stopFirst();
    stopSecond();
    await settle();
    expect(host.methods()).not.toContain("server.unsubscribe");
    stopLate();
    await settle();
    expect(
      host.sent.slice(1).map((request) => [request.method, request.params])
    ).toEqual([
      [
        "server.subscribe",
        { handle: 1, query: 1, method: "customers", args: ["lead"] },
      ],
      ["server.unsubscribe", { handle: 1, query: 1 }],
    ]);
  });

  it("refuses subscribing to a method that isn't a query", async () => {
    const { room } = await import("./servers");
    fakeHost();

    expect(() => room(Cards, "123abc").playCard.subscribe([7], () => {})).toThrow(
      "Cards.playCard isn't marked @query"
    );
  });

  it("delivers messages until the handle closes", async () => {
    const { room } = await import("./servers");
    const host = fakeHost();
    const game = room(Cards, "123abc");
    const messages = vi.fn();
    game.onMessage(messages);
    await settle();

    host.push({ type: "server.message", handle: 1, data: { type: "yourTurn" } });
    game.close();
    host.push({ type: "server.message", handle: 1, data: { type: "yourTurn" } });
    await settle();

    expect(messages).toHaveBeenCalledTimes(1);
    expect(host.methods()).toEqual(["server.open", "server.close"]);
    expect(room(Cards, "123abc")).not.toBe(game);
  });

  it("types handles from the class, without ctx or hooks", async () => {
    const { room } = await import("./servers");
    fakeHost();
    const game = room(Cards, "123abc");

    // @ts-expect-error playCard takes a number
    void game.playCard("7").catch(() => {});
    // @ts-expect-error server code's ctx isn't on the handle
    void game.ctx;
    // @ts-expect-error nor are its hooks
    void game.onJoin;
    expect(game).not.toHaveProperty("onJoin");
  });
});

describe("useQuery and useRoom", () => {
  it("renders a query's result as the server sends it", async () => {
    const { server } = await import("./servers");
    const { useQuery } = await import("./react");
    const host = fakeHost();
    const crm = server(Crm);
    function Board() {
      const customers = useQuery(crm.customers, "lead");
      return <p>{customers ? customers.join(", ") : "Loading"}</p>;
    }

    render(<Board />);
    await act(settle);
    expect(screen.getByText("Loading")).toBeTruthy();
    act(() =>
      host.push({ type: "server.result", handle: 1, query: 1, result: ["Acme"] })
    );
    expect(screen.getByText("Acme")).toBeTruthy();
    act(() =>
      host.push({
        type: "server.result",
        handle: 1,
        query: 1,
        result: ["Acme", "Globex"],
      })
    );
    expect(screen.getByText("Acme, Globex")).toBeTruthy();
  });

  it("re-renders with the room's people and leaves once unmounted", async () => {
    const { useRoom } = await import("./react");
    const host = fakeHost();
    function Players() {
      const game = useRoom(Cards, "123abc");
      return <p>{game.peers.map((peer) => peer.user.name).join(", ") || "Nobody"}</p>;
    }

    const { unmount } = render(<Players />);
    await act(settle);
    expect(screen.getByText("Nobody")).toBeTruthy();
    act(() =>
      host.push({
        type: "server.state",
        handle: 1,
        status: "connected",
        viewId: "v-1",
        peers: [alice],
        me: null,
      })
    );
    expect(screen.getByText("Alice")).toBeTruthy();

    unmount();
    await settle();
    await settle();
    expect(host.methods()).toEqual(["server.open", "server.close"]);
  });
});
