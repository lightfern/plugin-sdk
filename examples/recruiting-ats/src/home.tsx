import { connect, type FileEntry } from "lightfern:host";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

const ctx = await connect();
const STAGES = ["Applied", "Screen", "Onsite", "Offer"];

interface Candidate {
  path: string;
  name: string;
  stage: string;
}

// Each candidate is a markdown file with a `Stage:` line; default to the first column.
function stageOf(text: string): string {
  const line = text.split("\n").find((l) => l.startsWith("Stage:"));
  return line?.slice("Stage:".length).trim() ?? STAGES[0];
}

function Pipeline() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  useEffect(() => {
    const load = async () => {
      const entries = await ctx.files.list("candidates").catch(() => [] as FileEntry[]);
      const loaded = await Promise.all(
        entries
          .filter((e) => e.kind === "file" && e.name.endsWith(".md"))
          .map(async (e) => ({
            path: e.path,
            name: e.name.replace(/\.md$/, ""),
            stage: stageOf(await ctx.files.read(e.path)),
          }))
      );
      setCandidates(loaded);
    };
    void load();
    return ctx.files.watch("candidates", () => void load()); // re-read as candidates change
  }, []);

  return (
    <main className="board">
      {STAGES.map((stage) => (
        <section key={stage} className="column">
          <h2>{stage}</h2>
          {candidates
            .filter((c) => c.stage === stage)
            .map((c) => (
              <button
                key={c.path}
                className="card"
                onClick={() => void ctx.open(c.path)}
              >
                {c.name}
              </button>
            ))}
        </section>
      ))}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Pipeline />);
