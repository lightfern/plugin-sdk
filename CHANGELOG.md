# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow the scheme in
[docs/versioning.md](docs/versioning.md), where the major version equals the `manifestVersion` the
SDK implements.

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

[1.1.0]: https://github.com/lightfern/plugin-sdk/releases/tag/v1.1.0
[1.0.0]: https://github.com/lightfern/plugin-sdk/releases/tag/v1.0.0
