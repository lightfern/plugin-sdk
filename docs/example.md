# Reference plugin: Recruiting ATS

[`examples/recruiting-ats/`](../examples/recruiting-ats/) is a complete in-folder plugin. Follow its
shape rather than inventing structure. It shows the whole runtime contract in two small views:
connect, mount, enumerate a folder, read each file, follow disk changes, navigate, and write a file
back.

```
Recruiting ATS/            ← name the folder for people; the library shows this string
├── manifest.json
├── styles.css
└── src/
    ├── home.tsx           ← home view: the hiring pipeline
    └── candidate.tsx      ← file view for candidates/*.md
```

To run it, copy the folder into your library as `Recruiting ATS` (spaces and all) and add a
`candidates/` folder beside it with a few markdown files. Each candidate file carries a `Stage:`
line and some `- [ ]` interview steps.

## `manifest.json`

Declares `manifestVersion: "2.0"`, exact React versions in `dependencies`, both file permissions, a
home view and one file view whose `match` is `candidates/*.md`. Nothing else is needed: no
`package.json`, no build config.

## `src/home.tsx`: the home view

Connects with `await connect()` at module top level, then mounts a `Pipeline` component with
`createRoot`. The component lists `candidates/` with `ctx.files.list`, reads every markdown file
with `ctx.files.read` to find its `Stage:` line, and lays the candidates out as columns by stage.
Clicking a card calls `ctx.open(path)`, which routes to the file view below.

It stays in sync by watching the folder: `ctx.files.watch("candidates", …)` re-runs the load
whenever a candidate is added, removed, renamed or edited, and the effect returns the unsubscribe.

## `styles.css`

Uses only `--lf-*` tokens: `--lf-gap*` for the grid rhythm, `--lf-surface-card` and `--lf-hairline`
for the cards, `--lf-content-secondary` for column headings. No colour literals, no hand-rolled
shadows, so it follows dark mode without any extra work. See [Styling](styling.md).

## `src/candidate.tsx`: a file view is the same shape

The file view mounts the same way (`connect`, `createRoot`) but follows the open file instead of
listing a folder. `usePath()` gives the opened candidate's path and `useFile(path)` its text, both
live: navigating to another candidate or editing the file on disk re-renders without a reload.

It renders the file's `- [ ]` lines as checkboxes. Toggling one writes the whole file back with
`ctx.files.write(path, next, { overwrite: true })`. The write comes back as a disk change, which
`useFile` picks up, so the view re-renders from disk rather than from local state.
