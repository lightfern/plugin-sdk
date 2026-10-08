# @lightfern/plugin-sdk

The contract between [Lightfern](https://lightfern.com) plugins and the Lightfern desktop host:
manifest schema, view context, React bindings, wire protocol and theme tokens, plus the guide for
writing a plugin.

A plugin is a folder in your Lightfern library holding a `manifest.json` and some `.tsx`. Lightfern
builds it in-process on save; there is no toolchain on your side. Inside a view this package is
imported as `lightfern:host`, served by the app through an injected import map, so nothing is
installed:

```ts
import { connect } from "lightfern:host";

const ctx = await connect();
const text = await ctx.files.read(ctx.path);
// render `text`; on edit, ctx.files.write(ctx.path, next)
```

The host imports the same types to drive the other end of the bridge.

## Start here

- [Building a Lightfern plugin](docs/guide.md): the complete contract, from the manifest to the
  `ctx.files` API and keeping a view in sync with disk.
- [Styling](docs/styling.md): when to match the app or give a view its own look, the `--lf-*` design
  tokens, and CSS recipes.
- [The sandbox](docs/sandbox.md): what the iframe allows, CORS, keyboard shortcuts, text selection.
- [Reference plugin](docs/example.md) and its source in
  [`examples/recruiting-ats/`](examples/recruiting-ats/).

## What the package exports

| Import                             | Contents                                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `@lightfern/plugin-sdk`            | `connect()`, `ViewContext`/`FilesApi` types, manifest types and zod schema, `matchesPattern`, wire types. Served as `lightfern:host`. |
| `@lightfern/plugin-sdk/react`      | The React bindings `usePath`, `useFile`, `useFolder`, `useFileObjectUrl`, `useCurrentUser`. Served as `lightfern:host/react`.         |
| `@lightfern/plugin-sdk/manifest`   | Manifest types and `MANIFEST_VERSION`.                                                                                                |
| `@lightfern/plugin-sdk/match`      | The segment-aware glob matcher used for view `match` patterns.                                                                        |
| `@lightfern/plugin-sdk/protocol`   | The message shapes that cross the sandbox boundary.                                                                                   |
| `@lightfern/plugin-sdk/testing`    | `testManifest()` for tests.                                                                                                           |
| `@lightfern/plugin-sdk/theme.css`  | The default plugin theme: `--lf-*` tokens for light and dark, plus base element rules.                                                |
| `@lightfern/plugin-sdk/docs/*`     | The guide as raw markdown, for tools that serve it.                                                                                   |
| `@lightfern/plugin-sdk/examples/*` | The reference plugin source.                                                                                                          |

Every code export points at TypeScript source; there is no build step. The root barrel stays free of
React so Node-side consumers can import it.

## Versioning

Tags follow semver, and a plugin's `manifestVersion` is the tag's major and minor, so `v2.0.3`
implements `manifestVersion` `"2.0"`. Lightfern runs a plugin when they're on the same major version
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
