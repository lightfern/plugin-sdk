# @lightfern/plugin-sdk

The contract between [Lightfern](https://lightfern.com) apps and the Lightfern desktop host:
manifest schema, view context, React bindings, wire protocol and theme tokens, plus the guide for
writing an app. The package keeps its `plugin-sdk` name; a plugin is an app's code.

An app is a folder in your Lightfern library whose code folder holds a `manifest.json` and some
`.tsx`: views, and server code that reads and changes the app's files. Lightfern builds it
in-process on save; there is no toolchain on your side. Inside a view this package is imported as
`lightfern:host`, and in server code as `lightfern:server`, served by Lightfern, so nothing is
installed:

```ts
// src/notes.server.ts
import { type Caller, query, Server } from "lightfern:server";

export class Notes extends Server {
  text = query(async (_caller: Caller) => this.ctx.files.read("notes.md").catch(() => ""));
  async save(_caller: Caller, text: string) {
    await this.ctx.files.write("notes.md", text, { overwrite: true });
  }
}

// src/home.tsx: `useQuery(notes.text)` stays current; `notes.save(next)` saves
import { server } from "lightfern:host";
import { Notes } from "./notes.server";

const notes = server(Notes);
```

The host imports the same types to drive the other end of the bridge.

## Start here

- [Building a Lightfern app](docs/guide.md): the complete contract, from where to create the app and
  the manifest to routing paths to views and keeping them in sync.
- [Styling](docs/styling.md): when to match the app or give a view its own look, the `--lf-*` design
  tokens, and CSS recipes.
- [The sandbox](docs/sandbox.md): what differs from a normal web page in an app's frame.
- [Server code](docs/server.md): the classes that read and change an app's files, which views call
  like ordinary methods, and live queries.
- [Multiplayer](docs/multiplayer.md): rooms people share, with everyone's presence.
- [Moving an app to version 3](docs/migrating.md): how to move an app from before 3.0 to server
  code.
- [Reference app](docs/example.md) and its source in
  [`examples/recruiting-ats/`](examples/recruiting-ats/).

## What the package exports

| Import                             | Contents                                                                                                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@lightfern/plugin-sdk`            | `server()`, `room()`, `connect()`, their types, manifest types and zod schema, `matchesPattern`, wire types. Served as `lightfern:host`.                  |
| `@lightfern/plugin-sdk/react`      | The React bindings `useQuery`, `useRoom`, `usePath`, `useFileId` and `useCurrentUser`, and the 2.x file and room hooks. Served as `lightfern:host/react`. |
| `@lightfern/plugin-sdk/server`     | `Server`, `Room`, `query`, `UserError` and the `ctx` types, for server code. Served as `lightfern:server`.                                                |
| `@lightfern/plugin-sdk/manifest`   | Manifest types and `MANIFEST_VERSION`.                                                                                                                    |
| `@lightfern/plugin-sdk/match`      | The segment-aware glob matcher used for view `match` patterns.                                                                                            |
| `@lightfern/plugin-sdk/protocol`   | The message shapes that cross the sandbox boundary.                                                                                                       |
| `@lightfern/plugin-sdk/testing`    | `testManifest()` for tests.                                                                                                                               |
| `@lightfern/plugin-sdk/theme.css`  | The default app theme: `--lf-*` tokens for light and dark, plus base element rules.                                                                       |
| `@lightfern/plugin-sdk/docs/*`     | The guide as raw markdown, for tools that serve it.                                                                                                       |
| `@lightfern/plugin-sdk/examples/*` | The reference app source.                                                                                                                                 |

Every code export points at TypeScript source; there is no build step. The root barrel stays free of
React so Node-side consumers can import it.

## Versioning

Tags follow semver, and an app's `manifestVersion` is the tag's major and minor, so `v2.0.3`
implements `manifestVersion` `"2.0"`. Lightfern runs an app when they're on the same major version
and Lightfern's minor version is the same or newer.

- **Patch**: fixes and documentation changes.
- **Minor**: additive, non-breaking changes, like a new `ctx` method. Also bump `MANIFEST_VERSION`.
- **Major**: any breaking change. Also bump `MANIFEST_VERSION`.

Release in the same PR as the change: bump `version` in `package.json` and move the `CHANGELOG.md`
entries under a dated heading for it. Merging tags `vX.Y.Z` and publishes a GitHub release. The
package is consumed via git and is not published to npm.

## Development

```sh
pnpm install
pnpm test          # vitest (jsdom)
pnpm type-check    # src and examples
pnpm lint
pnpm format
```

## License

[MIT](LICENSE)
