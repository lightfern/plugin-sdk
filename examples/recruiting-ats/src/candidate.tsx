import { connect, server } from "lightfern:host";
import { usePath, useQuery } from "lightfern:host/react";
import { createRoot } from "react-dom/client";

import { Candidates } from "./candidates.server";

await connect();
const candidates = server(Candidates);

function Candidate() {
  const path = usePath();
  const steps = useQuery(candidates.steps, path) ?? [];

  return (
    <ul className="steps">
      {steps.map((step) => (
        <li key={step.line}>
          <label>
            <input
              type="checkbox"
              checked={step.done}
              // `steps` runs again once the file is saved, so the box follows the file.
              onChange={() => void candidates.toggleStep(path, step.line)}
            />
            {step.label}
          </label>
        </li>
      ))}
    </ul>
  );
}

createRoot(document.getElementById("root")!).render(<Candidate />);
