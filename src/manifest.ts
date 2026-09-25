// The shape of a plugin's `manifest.json`. This is the on-disk contract a plugin
// author writes and the host verifies, so the field names match the format documented
// in docs/guide.md (including the snake_case `network_permissions`) rather than the
// app's camelCase API convention. The zod schema in ./manifestSchema
// validates these shapes; `manifestEntries` is the one exception to an otherwise
// types-only module.

export type FilePermission = "files.read" | "files.write";

export type PluginPermission = FilePermission;

/** `"MAJOR.MINOR"`, matching the SDK release tag `vMAJOR.MINOR.x`. */
export type ManifestVersion = `${number}.${number}`;

/** The contract version this SDK implements. See {@link PluginManifest.manifestVersion}. */
export const MANIFEST_VERSION: ManifestVersion = "2.0";

/** A host on `supported` can run a plugin on the same major and the same or an older minor. */
export function supportsManifestVersion(
  supported: ManifestVersion,
  declared: ManifestVersion
): boolean {
  const [supportedMajor, supportedMinor] = supported.split(".").map(Number);
  const [major, minor] = declared.split(".").map(Number);
  return major === supportedMajor && minor! <= supportedMinor!;
}

/** Bare import specifier → exact browser-package version. */
export type PluginDependencies = Record<string, string>;

export interface ViewContribution {
  /**
   * Path pattern matched against file paths relative to the activation root. Only files
   * open views, so a pattern never names a folder (no trailing `/`).
   */
  match: string;
  /**
   * The view's entry within the plugin: a compiled HTML document (`dist/index.html`)
   * for a shipped bundle, or a source module (`src/board.tsx`) the host builds for an
   * in-folder plugin.
   */
  entry: string;
  /** Label shown when the host needs a name for the view. Defaults to the opened node's name. */
  title?: string;
}

export interface HomeViewContribution {
  /**
   * The view's entry within the plugin, same shape as a view's `entry`: a compiled HTML
   * document for a shipped bundle, or a source module the host builds for an in-folder plugin.
   */
  entry: string;
  /** Label shown for the view. Defaults to the plugin's `name`. */
  title?: string;
}

export interface PluginContributions {
  /**
   * May be omitted in `manifest.json`; the host normalizes an absent value to `[]`,
   * so this stays required as the normalized host contract.
   */
  views: ViewContribution[];
  /**
   * The plugin's own view: what opens when its node in the library is clicked. Unlike a
   * `views` entry it carries no `match` — it is bound to the plugin's own folder, which the
   * author cannot name (the install path is chosen by whoever activates the plugin), so the
   * host resolves it by identity rather than a path pattern.
   */
  home?: HomeViewContribution;
}

export interface PluginManifest {
  /**
   * The plugin contract this manifest is written against. One version covers the manifest
   * schema, the host API (`ctx`, RPC, pushes), the wire protocol, the `lightfern:host`
   * imports, and the `--lf-*` theme tokens. If the plugin uses something added in 2.1,
   * declare `"2.1"` so an older Lightfern shows an error instead of running it broken. A plain
   * number like `2` means `"2.0"`. Use `"2.0"` for a new plugin.
   */
  manifestVersion: ManifestVersion;
  /** Stable, globally unique reverse-domain identifier. */
  id: string;
  name: string;
  /** Semantic version of the published plugin. */
  version: string;
  /**
   * Browser packages the host prepares through its approved package service. Versions
   * are exact so a plugin has a stable executable dependency graph.
   */
  dependencies?: PluginDependencies;
  permissions: PluginPermission[];
  /**
   * Allowed network origins. May be omitted; the schema defaults it to `[]`. An entry is
   * an `https://` origin, optionally with a `*.` subdomain wildcard (see
   * validateNetworkPermission).
   */
  network_permissions?: string[];
  contributes: PluginContributions;
}

/** Every entry the host builds/serves: each `views[].entry` plus `home.entry` when declared. */
export function manifestEntries(manifest: PluginManifest): string[] {
  const entries = manifest.contributes.views.map((view) => view.entry);
  if (manifest.contributes.home) entries.push(manifest.contributes.home.entry);
  return entries;
}
