# Versioning

Releases of this repository are git tags, `vMAJOR.MINOR.PATCH`. The package is consumed from git
(the Lightfern host vendors it as a submodule), not from npm, which is why `package.json` stays
`private`.

## The major version is the `manifestVersion`

A plugin's `manifest.json` declares the contract it is written against:

```json
{ "manifestVersion": 2 }
```

That one integer covers the manifest schema, the `ctx`/RPC/event host API, the `lightfern:host`
imports, and the `--lf-*` theme tokens. The SDK's own `MANIFEST_VERSION` constant
([`src/manifest.ts`](../src/manifest.ts)) is the version this checkout implements, and the tag's
major version always equals it:

| Tag      | Implements           |
| -------- | -------------------- |
| `v1.x.y` | `manifestVersion: 1` |
| `v2.x.y` | `manifestVersion: 2` |

- **Patch** (`v1.0.1`): fixes and documentation changes. No contract change.
- **Minor** (`v1.1.0`): additive changes a `manifestVersion: 1` plugin can ignore: a new `ctx`
  method, a new optional manifest field, a new export, a new `--lf-*` token.
- **Major** (`v2.0.0`): a breaking change to anything the contract covers. It ships in the same
  commit as `MANIFEST_VERSION = 2`, and a host that supports both versions accepts plugins declaring
  either during its deprecation window.

Keeping the tag's major and the manifest version equal, but not identical, is deliberate: a docs fix
or an additive method can ship without pretending the contract changed.

## Cutting a release

1. Update [`CHANGELOG.md`](../CHANGELOG.md) and, for a minor or major, the `version` field in
   `package.json`.
2. Merge to `main`.
3. Tag the merge commit and push the tag:

```sh
git tag -a v1.0.0 -m "v1.0.0: manifestVersion 1 contract"
git push origin v1.0.0
```
