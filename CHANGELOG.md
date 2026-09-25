# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow the scheme in
[docs/versioning.md](docs/versioning.md), where the major and minor equal the `manifestVersion` the
SDK implements.

## [Unreleased]

## [2.0.0] - 2026-09-24

`manifestVersion: "2.0"`. A plugin that doesn't use React no longer needs `react` in its
dependencies.

- `manifestVersion` is now a string that includes the minor version, like `"2.0"`, so a plugin can
  say it needs something from a newer release. Lightfern runs a plugin when they're on the same
  major version and Lightfern's minor version is the same or newer. Plain numbers like `2` still
  work and mean `"2.0"`. Adds `supportsManifestVersion` and `manifestVersionSchema`.

- **Breaking:** the React bindings (`usePath`, `useFile`, `useFileObjectUrl`, `useCurrentUser`) move
  from `lightfern:host` to `lightfern:host/react`, and the package export `./view` becomes
  `./react`. `lightfern:host` is now React-free, so a view that only imports `connect()` loads
  without declaring `react`.

## [1.2.0] - 2026-09-23

- Expose the signed-in user's ID, name, email, and profile picture URL as `ctx.currentUser`, with
  `ctx.onCurrentUserChange` and `useCurrentUser()` for sign-in state changes.

## [1.1.0] - 2026-09-23

- Export `./docs/*` and `./examples/*`, so a consumer can load the guide and the reference plugin
  source through the package instead of by relative path.

## [1.0.0] - 2026-09-23

Initial public release of the `manifestVersion: 1` plugin contract.

- Manifest types and zod schema (`parseManifest`, `safeParseManifest`, `formatManifestErrors`),
  including `permissions`, `network_permissions`, `dependencies` and `contributes.home` / `views`.
- View runtime: `connect()` resolves a `ViewContext` with `pluginId`, `path`, `homePath`, the
  `files` API (`read`, `write`, `list`, `move`, `delete`, `watch`), `open` and `onPathChange`.
- React bindings: `usePath`, `useFile`, `useFileObjectUrl`.
- Wire protocol types shared by the host and the sandboxed view.
- Segment-aware glob matcher for view `match` patterns and the network-permission validator.
- `theme.css`: the `--lf-*` design tokens the host links into every view.
- Authoring guide under `docs/` and the Recruiting ATS reference plugin under `examples/`.

[2.0.0]: https://github.com/lightfern/plugin-sdk/releases/tag/v2.0.0
[1.2.0]: https://github.com/lightfern/plugin-sdk/releases/tag/v1.2.0
[1.1.0]: https://github.com/lightfern/plugin-sdk/releases/tag/v1.1.0
[1.0.0]: https://github.com/lightfern/plugin-sdk/releases/tag/v1.0.0
