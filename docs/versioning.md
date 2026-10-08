# Versioning

Releases of this repository are git tags, `vMAJOR.MINOR.PATCH`. The package is consumed from git
(the Lightfern host vendors it as a submodule), not from npm, which is why `package.json` stays
`private`.

## The `manifestVersion` is the tag's major and minor

A plugin's `manifest.json` declares the contract it is written against:

```json
{ "manifestVersion": "2.1" }
```

That one version covers the manifest schema, the `ctx`/RPC/event host API, the `lightfern:host`
imports, and the `--lf-*` theme tokens. The SDK's own `MANIFEST_VERSION` constant
([`src/manifest.ts`](../src/manifest.ts)) is the version this checkout implements, and it always
equals the tag's major and minor:

| Tag      | Implements               |
| -------- | ------------------------ |
| `v1.2.y` | `manifestVersion: "1.2"` |
| `v2.0.y` | `manifestVersion: "2.0"` |
| `v2.1.y` | `manifestVersion: "2.1"` |
| `v2.2.y` | `manifestVersion: "2.2"` |

- **Patch**: bump this for fixes and documentation changes. `MANIFEST_VERSION` stays the same.
- **Minor**: bump this for additive, non-breaking changes from the previous release. For example,
  adding a new `ctx` method.
- **Major**: bump this for any and all breaking changes.

Lightfern runs a plugin when they're on the same major version and Lightfern's minor version is the
same or newer. For example, Lightfern on 2.1 runs plugins built for 2.0 and 2.1, but not 2.2 or 3.0.
So a plugin should declare the oldest version that has everything it uses. Older manifests with a
plain number like `2` are treated as `"2.0"`.

## Cutting a release

Release in the same pull request as the change: bump the `version` field in `package.json`, move the
`CHANGELOG.md` entries under a dated heading for that version, and, for a minor or major, bump
`MANIFEST_VERSION`. When it merges, the release workflow tags the merge commit `vX.Y.Z` and
publishes a GitHub release with that version's changelog entries. A merge that leaves the version
alone is not released.
