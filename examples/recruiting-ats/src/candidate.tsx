import { connect, server } from "lightfern:host";
import { usePath, useQuery } from "lightfern:host/react";
import { createRoot } from "react-dom/client";

import { Candidates } from "./candidates.server";

await connect();
const candidates = server(Candidates);

function Candidate() {
  // The route is `candidates/ada`. On desktop, opening the file from the library gives
  // `candidates/ada.md`, so drop the extension too.
  const name = usePath().slice("candidates/".length).replace(/\.md$/, "");
  const steps = useQuery(candidates.steps, name) ?? [];

  return (
    <ul className="steps">
      {steps.map((step) => (
        <li key={step.line}>
          <label>
            <input
              type="checkbox"
              checked={step.done}
              // `steps` runs again once the file is saved, so the box follows the file.
              onChange={() => void candidates.toggleStep(name, step.line)}
            />
            {step.label}
          </label>
        </li>
      ))}
    </ul>
  );
}

createRoot(document.getElementById("root")!).render(<Candidate />);
