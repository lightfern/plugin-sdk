// The shape of a plugin's `manifest.json`. This is the on-disk contract a plugin
// author writes and the host verifies, so the field names match the format documented
// in docs/guide.md (including the snake_case `network_permissions`) rather than the
// app's camelCase API convention. The zod schema in ./manifestSchema
// validates these shapes; `manifestEntries` is the one exception to an otherwise
// types-only module.

export type FilePermission = "files.read" | "files.write";

/** Devices a view reaches through browser APIs. Each name is also the iframe `allow` feature it grants. */
export const DEVICE_PERMISSIONS = ["camera", "microphone"] as const;

export type DevicePermission = (typeof DEVICE_PERMISSIONS)[number];

export type PluginPermission = FilePermission | DevicePermission | "multiplayer";

/** `"MAJOR.MINOR"`, matching the SDK release tag `vMAJOR.MINOR.x`. */
export type ManifestVersion = `${number}.${number}`;

/** The contract version this SDK implements. See {@link PluginManifest.manifestVersion}. */
export const MANIFEST_VERSION: ManifestVersion = "3.3";

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

/** The type of a widget argument. Addresses carry text, so the host converts each value to it. */
export type WidgetArgType = "string" | "number" | "boolean" | "enum";

export interface WidgetArg {
  type: WidgetArgType;
  /** An `enum` argument's allowed values. */
  values?: string[];
  /** Whether an embed may leave the argument out. An argument with a `default` is optional too. */
  optional?: boolean;
  default?: string | number | boolean;
  /** What the argument means, for whoever writes an embed, the assistant included. */
  description: string;
}

/** A widget's argument values, converted to their declared types. */
export type WidgetArgValues = Record<string, string | number | boolean>;

export interface WidgetContribution {
  /** Unique within the app; embeds name it after `#widget=`. */
  id: string;
  /** The widget's entry within the plugin, same shape as a view's `entry`. */
  entry: string;
  title: string;
  /** What the widget shows, for whoever chooses one, the assistant included. */
  description: string;
  /** Argument name → declaration. May be omitted; the schema defaults it to `{}`. */
  args?: Record<string, WidgetArg>;
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
  /**
   * Server modules, as paths within the plugin with their extension, like `src/cards.server.ts`.
   * Each exports classes that extend `Server` or `Room` from `lightfern:server` (`export class`),
   * which views reach with `server` and `room`. Lightfern runs them on its servers, never in a view.
   */
  servers?: string[];
  /**
   * Small parts of the app that notes and the assistant's replies embed, from version 3.3. Each
   * reaches the app's data through its server code, as views do.
   */
  widgets?: WidgetContribution[];
}

export interface PluginManifest {
  /**
   * The plugin contract this manifest is written against. One version covers the manifest
   * schema, the host API (`ctx`, RPC, pushes), the wire protocol, the `lightfern:host`
   * imports, and the `--lf-*` theme tokens. Declare the latest major, with the earliest minor
   * that has everything the plugin uses, so an older Lightfern shows an error instead of running
   * it broken. A plain number like `2` means `"2.0"`.
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
  /** Capabilities the views use. May be omitted since 2.1; the schema defaults it to `[]`. */
  permissions?: PluginPermission[];
  /**
   * Allowed network origins. May be omitted; the schema defaults it to `[]`. An entry is
   * an `https://` origin, optionally with a `*.` subdomain wildcard (see
   * validateNetworkPermission).
   */
  network_permissions?: string[];
  contributes: PluginContributions;
}

/** Every entry the host builds/serves: each view's, the home view's and each widget's. */
export function manifestEntries(manifest: PluginManifest): string[] {
  const entries = manifest.contributes.views.map((view) => view.entry);
  if (manifest.contributes.home) entries.push(manifest.contributes.home.entry);
  for (const widget of manifest.contributes.widgets ?? []) entries.push(widget.entry);
  return entries;
}
