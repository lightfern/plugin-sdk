import { describe, expect, it } from "vitest";

import { query, Server } from "./server";

describe("query", () => {
  it("marks the function for the runtime and leaves it working", async () => {
    class Crm extends Server {
      prefix = "stage:";
      customers = query(async (stage: string) => [this.prefix + stage]);
      async move() {}
    }
    const crm = new Crm();
    const marked = (fn: object) => Symbol.for("lightfern.query") in fn;

    expect(marked(crm.customers)).toBe(true);
    expect(marked(crm.move)).toBe(false);
    expect(await crm.customers("lead")).toEqual(["stage:lead"]);
  });
});
