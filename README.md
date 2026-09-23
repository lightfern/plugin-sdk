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
- [Styling](docs/styling.md): the `--lf-*` design tokens and CSS recipes.
- [The sandbox](docs/sandbox.md): what the iframe allows, CORS, keyboard shortcuts, text selection.
- [Reference plugin](docs/example.md) and its source in
  [`examples/recruiting-ats/`](examples/recruiting-ats/).
- [Versioning](docs/versioning.md): how tags relate to `manifestVersion`.

## What the package exports

| Import                            | Contents                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `@lightfern/plugin-sdk`           | `connect()`, `ViewContext`/`FilesApi` types, manifest types and zod schema, `matchesPattern`, wire types.     |
| `@lightfern/plugin-sdk/view`      | The root barrel plus the React bindings `usePath`, `useFile`, `useFileObjectUrl`. Served as `lightfern:host`. |
| `@lightfern/plugin-sdk/manifest`  | Manifest types and `MANIFEST_VERSION`.                                                                        |
| `@lightfern/plugin-sdk/match`     | The segment-aware glob matcher used for view `match` patterns.                                                |
| `@lightfern/plugin-sdk/protocol`  | The message shapes that cross the sandbox boundary.                                                           |
| `@lightfern/plugin-sdk/testing`   | `testManifest()` for tests.                                                                                   |
| `@lightfern/plugin-sdk/theme.css` | The default plugin theme: `--lf-*` tokens for light and dark, plus base element rules.                        |

Every export points at TypeScript source; there is no build step. The root barrel stays free of
React so Node-side consumers can import it.

## Versioning

Tags are semver and the major version equals the `manifestVersion` the SDK implements: `v1.x.y`
means `manifestVersion: 1`. Additive changes bump minor, fixes bump patch, and a contract break
bumps both the major and `MANIFEST_VERSION` in the same commit. Details in
[docs/versioning.md](docs/versioning.md). The package is consumed via git and is not published to
npm.

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
