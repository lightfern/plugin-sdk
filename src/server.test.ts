import { describe, expect, it } from "vitest";

import { type Caller, query, Server } from "./server";

describe("query", () => {
  it("marks the function for the runtime and leaves it working", async () => {
    class Crm extends Server {
      prefix = "stage:";
      customers = query(async (_caller: Caller, stage: string) => [
        this.prefix + stage,
      ]);
      async move() {}
    }
    const crm = new Crm();
    const marked = (fn: object) => Symbol.for("lightfern.query") in fn;

    expect(marked(crm.customers)).toBe(true);
    expect(marked(crm.move)).toBe(false);
    const caller: Caller = {
      user: { id: "alice", name: "Alice", profilePictureUrl: null },
      viewId: "v-1",
      access: "use_only",
    };
    expect(await crm.customers(caller, "lead")).toEqual(["stage:lead"]);
  });
});
