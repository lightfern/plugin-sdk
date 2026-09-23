import type { PluginManifest } from "./manifest";
import { MANIFEST_VERSION } from "./manifest";

/** A valid manifest for tests; override what the test cares about. */
export function testManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    manifestVersion: MANIFEST_VERSION,
    id: "test-plugin",
    name: "Test plugin",
    version: "1.0.0",
    permissions: [],
    contributes: { views: [] },
    ...overrides,
  };
}
