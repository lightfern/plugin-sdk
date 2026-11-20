import { describe, expect, it } from "vitest";

import type { WidgetContribution } from "./manifest";
import { widgetArgsSchema } from "./manifestSchema";

const milestone: Pick<WidgetContribution, "args"> = {
  args: {
    name: { type: "string", description: "The milestone" },
    limit: { type: "number", optional: true, description: "Tickets to list" },
    showDone: { type: "boolean", default: true, description: "Show done tickets" },
    size: {
      type: "enum",
      values: ["small", "large"],
      default: "small",
      description: "Size",
    },
  },
};

describe("widgetArgsSchema", () => {
  const schema = widgetArgsSchema(milestone);

  it("converts numbers, yes/no values and enums to their types", () => {
    expect(
      schema.parse({ name: "M1", limit: "5", showDone: "false", size: "large" })
    ).toEqual({ name: "M1", limit: 5, showDone: false, size: "large" });
  });

  it("fills in defaults and leaves optional arguments out", () => {
    expect(schema.parse({ name: "M1" })).toEqual({
      name: "M1",
      showDone: true,
      size: "small",
    });
  });

  const problems = (args: Record<string, string>) =>
    schema.safeParse(args).error?.issues.map((issue) => issue.message);

  it("names a missing required argument", () => {
    expect(problems({})).toEqual(["name is missing."]);
  });

  it("names an argument of the wrong type, including an empty number", () => {
    for (const limit of ["many", ""]) {
      expect(problems({ name: "M1", limit })).toEqual(["limit must be a number."]);
    }
    expect(problems({ name: "M1", showDone: "maybe" })).toEqual([
      "showDone must be true or false.",
    ]);
  });

  it("lists an enum's values when one is outside them", () => {
    expect(problems({ name: "M1", size: "huge" })).toEqual([
      "size must be small or large.",
    ]);
  });

  it("refuses undeclared arguments", () => {
    expect(problems({ name: "M1", colour: "red" })).toEqual([
      'This widget has no argument "colour".',
    ]);
    expect(problems({ name: "M1", colour: "red", shape: "round" })).toEqual([
      'This widget has no arguments "colour" and "shape".',
    ]);
  });
});
