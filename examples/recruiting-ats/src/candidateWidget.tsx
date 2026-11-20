import { connect, server } from "lightfern:host";
import { useQuery, useWidget } from "lightfern:host/react";
import { createRoot } from "react-dom/client";

import { Candidates } from "./candidates.server";

const ctx = await connect();
const candidates = server(Candidates);

// One candidate's stage and interview progress, for a note that embeds
// `![Ada](/Hiring#widget=candidate&name=ada)`.
function CandidateCard() {
  const { name } = useWidget<{ name: string }>()!.args;
  const stage = useQuery(candidates.all)?.find((c) => c.name === name)?.stage;
  const steps = useQuery(candidates.steps, name) ?? [];
  const done = steps.filter((step) => step.done).length;

  return (
    <button
      className="card widget"
      onClick={() => void ctx.open(`candidates/${name}`, true)}
    >
      <strong>{name}</strong>
      <span>{stage ?? "…"}</span>
      <span>
        {done}/{steps.length} steps
      </span>
    </button>
  );
}

createRoot(document.getElementById("root")!).render(<CandidateCard />);
