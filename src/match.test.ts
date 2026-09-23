import { describe, expect, it } from "vitest";

import { matchesPattern, validateMatchPattern } from "./match";

describe("matchesPattern", () => {
  const file = (pattern: string, path: string) => matchesPattern(pattern, path);

  it("*.md matches markdown files directly in the root only", () => {
    expect(file("*.md", "notes.md")).toBe(true);
    expect(file("*.md", "sub/notes.md")).toBe(false);
    expect(file("*.md", "notes.txt")).toBe(false);
  });

  it("**/*.md matches markdown files at any depth, including the root", () => {
    expect(file("**/*.md", "notes.md")).toBe(true);
    expect(file("**/*.md", "a/notes.md")).toBe(true);
    expect(file("**/*.md", "a/b/c/notes.md")).toBe(true);
    expect(file("**/*.md", "a/notes.txt")).toBe(false);
  });

  it("candidates/*.md matches only direct children of candidates", () => {
    expect(file("candidates/*.md", "candidates/x.md")).toBe(true);
    expect(file("candidates/*.md", "candidates/sub/x.md")).toBe(false);
    expect(file("candidates/*.md", "x.md")).toBe(false);
  });

  it("**/candidates/*.md matches inside any candidates folder", () => {
    expect(file("**/candidates/*.md", "candidates/x.md")).toBe(true);
    expect(file("**/candidates/*.md", "team/candidates/x.md")).toBe(true);
    expect(file("**/candidates/*.md", "a/b/candidates/x.md")).toBe(true);
    expect(file("**/candidates/*.md", "a/candidates/sub/x.md")).toBe(false);
  });

  it("matches the CSV plugin pattern at any depth", () => {
    expect(file("**/*.csv", "report.csv")).toBe(true);
    expect(file("**/*.csv", "data/2026/report.csv")).toBe(true);
    expect(file("**/*.csv", "data/report.tsv")).toBe(false);
  });

  it("? matches exactly one character within a segment", () => {
    expect(file("log-?.txt", "log-1.txt")).toBe(true);
    expect(file("log-?.txt", "log-12.txt")).toBe(false);
    expect(file("log-?.txt", "log-.txt")).toBe(false);
  });

  it("wildcards never cross segment boundaries", () => {
    expect(file("*", "a/b")).toBe(false);
    expect(file("a*b", "a/b")).toBe(false);
  });

  it("a literal file pattern matches an exact path", () => {
    expect(file("index.md", "index.md")).toBe(true);
    expect(file("index.md", "sub/index.md")).toBe(false);
  });
});

describe("validateMatchPattern", () => {
  const valid: string[] = ["*.csv", "**/*.md", "candidates/*.md", "**/index.md"];
  for (const pattern of valid) {
    it(`accepts ${pattern}`, () => {
      expect(validateMatchPattern(pattern)).toBeNull();
    });
  }

  const invalid: string[] = [
    "",
    "/abs/path",
    "C:/x",
    "../escape",
    "./notes/*.md",
    "a\\b",
    // Folder patterns: only files open views.
    "assets/**/",
    "**/",
    "./",
    ".",
  ];
  for (const pattern of invalid) {
    it(`rejects ${JSON.stringify(pattern)}`, () => {
      expect(validateMatchPattern(pattern)).not.toBeNull();
    });
  }
});
