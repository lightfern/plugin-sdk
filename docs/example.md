# Reference app: Recruiting ATS

[`examples/recruiting-ats/`](../examples/recruiting-ats/) is the code folder of a complete app.
Follow its shape rather than inventing structure. It shows the whole contract in a few small files:
server code that lists candidates and changes them, a home view and a file view that subscribe to
its queries and call its methods, and navigation between them.

```
Recruiting/                         ← the app folder: name it for people; the library shows this
├── candidates/                     ← the app's data
│   └── ada.md
└── code/                           ← examples/recruiting-ats/, the code folder
    ├── manifest.json
    ├── styles.css
    └── src/
        ├── candidates.server.ts    ← server code: reads and changes the candidate files
        ├── stages.ts               ← shared by the views and the server code
        ├── home.tsx                ← home view: the hiring pipeline
        └── candidate.tsx           ← file view for candidates/*.md
```

To run it, create a `Recruiting` folder in your library, copy `examples/recruiting-ats/` into it as
`code`, and add a `candidates/` folder beside the code with a few markdown files. Each candidate
file carries a `Stage:` line and some `- [ ]` interview steps. When you build your own app from it,
give it its own `id`, since two apps with the same `id` run one copy of the code.

## `manifest.json`

The manifest uses `manifestVersion` `"3.1"` and pins exact React versions in `dependencies`. It has
a home view, one file view that opens any file matching `candidates/*.md`, and one server module. It
asks for no permissions: views reach the files through the server code. That's all it needs: there's
no `package.json` and no build config.

## `src/candidates.server.ts`: the server code

`Candidates` extends `Server`, so each view gets its own private server. It has:

- `all`, a query that lists `candidates/`, reads each markdown file and returns every candidate with
  the stage from its `Stage:` line.
- `steps`, a query that returns one candidate's `- [ ]` lines.
- `toggleStep`, a method that ticks or unticks one step and saves the file.

Each takes the caller first, as every method and query must. A view chooses which path to pass, so
the private `#read` checks it's a file in `candidates/` before reading or writing it. `toggleStep`
also checks the line is still a step, and throws a `UserError` if it isn't, which the view gets as a
failed call with that message.

Nothing here watches files. Lightfern records what each query read, and runs it again when one of
those files changes: after `toggleStep` saves, and when someone edits a candidate anywhere else.

## `src/stages.ts`

The stage names are shared by the home view and the server code. They live in their own file because
a view's import of a server module gets only its classes, not anything else it exports.

## `src/home.tsx`: the home view

Connects with `await connect()` for `ctx.open`, makes the handle with `server(Candidates)` at module
top level, and mounts a `Pipeline` component with `createRoot`. `useQuery(candidates.all)` gives the
candidates, kept current, and the component lays them out as columns by stage. Clicking a card calls
`ctx.open(path)`, which routes to the file view below.

## `src/candidate.tsx`: a file view is the same shape

The file view mounts the same way but follows the open file. `usePath()` gives the opened
candidate's path, and `useQuery(candidates.steps, path)` its steps: both live, so navigating to
another candidate or editing the file re-renders without a reload.

Toggling a checkbox calls `candidates.toggleStep(path, line)`. The view keeps no state of its own:
once the file is saved, `steps` runs again and the box follows the file.

## `styles.css`

Uses only `--lf-*` tokens: `--lf-gap*` for the grid rhythm, `--lf-surface-card` and `--lf-hairline`
for the cards, `--lf-content-secondary` for column headings. No colour literals, no hand-rolled
shadows, so it follows dark mode without any extra work. See [Styling](styling.md).
