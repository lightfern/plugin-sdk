import { type Caller, query, Server, UserError } from "lightfern:server";

import { STAGES } from "./stages";

export interface Candidate {
  path: string;
  name: string;
  stage: string;
}

export interface Step {
  line: number;
  label: string;
  done: boolean;
}

// Each candidate is a markdown file with a `Stage:` line; default to the first stage.
function stageOf(text: string): string {
  const line = text.split("\n").find((l) => l.startsWith("Stage:"));
  return line?.slice("Stage:".length).trim() ?? STAGES[0];
}

export class Candidates extends Server {
  // Every candidate with their stage. Runs again when a candidate is added, removed or edited.
  all = query(async (_caller: Caller): Promise<Candidate[]> => {
    const entries = await this.ctx.files.list("candidates").catch(() => []);
    return Promise.all(
      entries
        .filter((e) => e.kind === "file" && e.name.endsWith(".md"))
        .map(async (e) => ({
          path: e.path,
          name: e.name.replace(/\.md$/, ""),
          stage: stageOf(await this.ctx.files.read(e.path)),
        }))
    );
  });

  // One candidate's `- [ ]` interview steps.
  steps = query(async (_caller: Caller, path: string): Promise<Step[]> => {
    const lines = (await this.#read(path)).split("\n");
    return lines.flatMap((text, line) => {
      const step = /^- \[( |x)\] (.*)/.exec(text);
      return step ? [{ line, label: step[2], done: step[1] === "x" }] : [];
    });
  });

  async toggleStep(_caller: Caller, path: string, line: number) {
    const lines = (await this.#read(path)).split("\n");
    if (!/^- \[( |x)\]/.test(lines[line] ?? ""))
      throw new UserError("That step has changed");
    lines[line] = lines[line].replace(
      /^- \[( |x)\]/,
      (_, box) => `- [${box === "x" ? " " : "x"}]`
    );
    await this.ctx.files.write(path, lines.join("\n"), { overwrite: true });
  }

  // A view chooses the path, so check it's a candidate before reading or writing it.
  async #read(path: string): Promise<string> {
    if (!/^candidates\/[^/]+\.md$/.test(path))
      throw new UserError("That isn't a candidate");
    return this.ctx.files.read(path);
  }
}
