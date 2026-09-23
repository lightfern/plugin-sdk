import { describe, expect, it } from "vitest";

import type { PluginManifest } from "./manifest";
import {
  formatManifestErrors,
  parseManifest,
  safeParseManifest,
} from "./manifestSchema";
import { testManifest } from "./testing";

const validManifest = testManifest({
  id: "com.lightfern.csv",
  name: "CSV Viewer",
  permissions: ["files.read", "files.write"],
  contributes: {
    views: [{ match: "**/*.csv", entry: "dist/index.html" }],
  },
});

const clone = (): PluginManifest => structuredClone(validManifest);

describe("parseManifest", () => {
  it("accepts a valid manifest and returns it typed", () => {
    const manifest = parseManifest(validManifest);
    expect(manifest.id).toBe("com.lightfern.csv");
    expect(manifest.contributes.views).toHaveLength(1);
  });

  it("defaults an omitted network_permissions to an empty array", () => {
    const { network_permissions: _omitted, ...bare } = clone();
    expect(parseManifest(bare).network_permissions).toEqual([]);
  });

  it("accepts exact and wildcard https origins in network_permissions", () => {
    const manifest = clone();
    manifest.network_permissions = [
      "https://api.example.com",
      "https://*.example.com",
      "https://localhost:8443",
    ];
    expect(() => parseManifest(manifest)).not.toThrow();
  });
});

describe("safeParseManifest", () => {
  const expectErrorContaining = (input: unknown, needle: string) => {
    const result = safeParseManifest(input);
    expect(result.success).toBe(false);
    if (result.success) return;
    const message = formatManifestErrors(result.error).join("\n");
    expect(message).toContain(needle);
  };

  it("accepts a bare (non-dotted) id", () => {
    expect(() => parseManifest({ ...clone(), id: "csv-viewer" })).not.toThrow();
  });

  it("rejects a missing manifestVersion", () => {
    const { manifestVersion: _omitted, ...bare } = clone();
    expectErrorContaining(bare, "manifestVersion");
  });

  it("rejects manifestVersion 2", () => {
    expectErrorContaining({ ...clone(), manifestVersion: 2 }, "manifestVersion");
  });

  it("rejects an id that is not URL-safe", () => {
    expectErrorContaining({ ...clone(), id: "CSV Viewer" }, "lowercase alphanumeric");
  });

  it("rejects a non-semver version", () => {
    expectErrorContaining({ ...clone(), version: "v1" }, "semantic version");
  });

  it("rejects an unknown permission", () => {
    expectErrorContaining({ ...clone(), permissions: ["files.delete"] }, "permissions");
  });

  it("rejects a non-https network origin", () => {
    expectErrorContaining(
      { ...clone(), network_permissions: ["http://insecure.example.com"] },
      "https origin"
    );
  });

  it("rejects a network entry that is an origin with a path", () => {
    expectErrorContaining(
      { ...clone(), network_permissions: ["https://api.example.com/v1"] },
      "https origin"
    );
  });

  it("rejects a network entry carrying CSP metacharacters", () => {
    expectErrorContaining(
      { ...clone(), network_permissions: ["https://a.com;img-src *"] },
      "https origin"
    );
  });

  it("rejects an invalid view match pattern with the matcher's own message", () => {
    const manifest = clone();
    manifest.contributes.views[0].match = "../escape";
    expectErrorContaining(manifest, "'..'");
  });

  it("rejects a folder match pattern — only files open views", () => {
    for (const match of ["./", "assets/**/"]) {
      const manifest = clone();
      manifest.contributes.views[0].match = match;
      expectErrorContaining(manifest, "trailing '/'");
    }
  });

  // Two patterns pointing at one entry module are one mounted view in the host, so this
  // is a supported shape rather than a duplicate.
  it("accepts several views sharing an entry module", () => {
    const manifest = clone();
    manifest.contributes.views.push({ match: "**/*.tsv", entry: "dist/index.html" });
    expect(() => parseManifest(manifest)).not.toThrow();
  });

  it("accepts exact-versioned dependencies, including scoped and deep-import roots", () => {
    const manifest = clone();
    manifest.dependencies = {
      react: "19.2.0",
      "react-dom": "19.2.0",
      "@scope/pkg": "1.0.0-beta.1",
    };
    expect(() => parseManifest(manifest)).not.toThrow();
  });

  it("defaults dependencies to an empty object when omitted", () => {
    const result = parseManifest(clone());
    expect(result.dependencies).toEqual({});
  });

  it("rejects a dependency version range", () => {
    expectErrorContaining(
      { ...clone(), dependencies: { react: "^19.0.0" } },
      "exact semantic version"
    );
  });

  it("rejects a dependency keyed by a deep import path", () => {
    expectErrorContaining(
      { ...clone(), dependencies: { "react-dom/client": "19.2.0" } },
      "npm package name"
    );
  });

  it("accepts a home view contribution", () => {
    const manifest = clone();
    manifest.contributes.home = { entry: "src/home.tsx", title: "Board" };
    expect(() => parseManifest(manifest)).not.toThrow();
  });

  it("accepts a home-only manifest, defaulting views to an empty array", () => {
    const manifest = clone();
    const result = parseManifest({
      ...manifest,
      contributes: { home: { entry: "src/home.tsx" } },
    });
    expect(result.contributes.views).toEqual([]);
    expect(result.contributes.home?.entry).toBe("src/home.tsx");
  });

  it("rejects a home view with an empty entry", () => {
    const manifest = clone();
    manifest.contributes.home = { entry: "" };
    expectErrorContaining(manifest, "contributes.home.entry");
  });

  it("reports the path of the failing field", () => {
    const result = safeParseManifest({ ...clone(), name: "" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(formatManifestErrors(result.error).join("\n")).toContain("name:");
  });
});
