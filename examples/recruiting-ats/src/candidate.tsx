import { connect, useFile, usePath } from "lightfern:host";
import { createRoot } from "react-dom/client";

const ctx = await connect();

function Candidate() {
  const path = usePath();
  const text = useFile(path);
  const lines = text?.split("\n") ?? [];

  const toggle = (index: number) => {
    const next = lines.map((line, i) =>
      i === index
        ? line.replace(/^- \[( |x)\]/, (_, box) => `- [${box === "x" ? " " : "x"}]`)
        : line
    );
    // The write comes back as a disk change, which re-reads and re-renders.
    void ctx.files.write(path, next.join("\n"), { overwrite: true });
  };

  return (
    <ul className="steps">
      {lines.map((line, i) => {
        const item = /^- \[( |x)\] (.*)/.exec(line);
        if (!item) return null;
        return (
          <li key={i}>
            <label>
              <input
                type="checkbox"
                checked={item[1] === "x"}
                onChange={() => toggle(i)}
              />
              {item[2]}
            </label>
          </li>
        );
      })}
    </ul>
  );
}

createRoot(document.getElementById("root")!).render(<Candidate />);
