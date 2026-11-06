import { connect, server } from "lightfern:host";
import { useQuery } from "lightfern:host/react";
import { createRoot } from "react-dom/client";

import { Candidates } from "./candidates.server";
import { STAGES } from "./stages";

const ctx = await connect();
const candidates = server(Candidates);

function Pipeline() {
  // Kept current by Lightfern: it runs `all` again whenever a candidate file changes.
  const all = useQuery(candidates.all) ?? [];

  return (
    <main className="board">
      {STAGES.map((stage) => (
        <section key={stage} className="column">
          <h2>{stage}</h2>
          {all
            .filter((c) => c.stage === stage)
            .map((c) => (
              <button
                key={c.name}
                className="card"
                onClick={() => void ctx.open(`candidates/${c.name}`)}
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
