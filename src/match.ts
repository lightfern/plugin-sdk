// The path-pattern matcher for manifest `match` globs, evaluated against file paths
// relative to the activation root. This is a purpose-built matcher for the segment-aware
// semantics documented in docs/guide.md (File views), not minimatch/picomatch:
//
//   *   zero or more characters within one segment; never matches `/`
//   ?   exactly one character within one segment; never matches `/`
//   **  zero or more complete path segments (only when it is a complete segment)
//
// Only files open views, so patterns never name folders. Paths are relative POSIX paths.

export function matchesPattern(pattern: string, path: string): boolean {
  const normalized = path.replace(/^\/+|\/+$/g, "");
  const pathSegments = normalized === "" ? [] : normalized.split("/");
  return matchSegments(pattern.split("/"), pathSegments);
}

/** Validate a manifest match pattern; returns an error message, or null when valid. */
export function validateMatchPattern(pattern: string): string | null {
  if (pattern.length === 0) return "pattern must not be empty";
  if (pattern.includes("\\")) return "pattern must use '/' separators";
  if (pattern.startsWith("/")) return "pattern must not start with '/'";
  if (pattern.endsWith("/")) {
    return "pattern must name files, not folders — drop the trailing '/'";
  }
  if (/^[A-Za-z]:/.test(pattern)) return "pattern must not contain a drive letter";

  for (const segment of pattern.split("/")) {
    if (segment === "." || segment === "..") {
      return "pattern must not contain '.' or '..' segments";
    }
  }
  return null;
}

// Token-level wildcard match where `**` consumes zero or more whole segments. The
// two-pointer backtracking mirrors classic glob matching: `star`/`mark` remember the
// last `**` so a failed match can extend it by one more segment.
function matchSegments(pattern: string[], path: string[]): boolean {
  let pi = 0;
  let si = 0;
  let star = -1;
  let mark = 0;

  while (si < path.length) {
    if (pi < pattern.length && pattern[pi] === "**") {
      star = pi;
      mark = si;
      pi++;
    } else if (
      pi < pattern.length &&
      pattern[pi] !== "**" &&
      segmentMatches(pattern[pi], path[si])
    ) {
      pi++;
      si++;
    } else if (star !== -1) {
      pi = star + 1;
      mark++;
      si = mark;
    } else {
      return false;
    }
  }

  while (pi < pattern.length && pattern[pi] === "**") pi++;
  return pi === pattern.length;
}

// Within a single segment `*` matches zero or more characters and `?` exactly one.
// A two-pointer backtracking match (the same shape as `matchSegments`) avoids building
// a dynamic RegExp, sidestepping any ReDoS concern from attacker-authored patterns.
function segmentMatches(pattern: string, segment: string): boolean {
  let pi = 0;
  let si = 0;
  let star = -1;
  let mark = 0;

  while (si < segment.length) {
    if (pi < pattern.length && (pattern[pi] === "?" || pattern[pi] === segment[si])) {
      pi++;
      si++;
    } else if (pi < pattern.length && pattern[pi] === "*") {
      star = pi;
      mark = si;
      pi++;
    } else if (star !== -1) {
      pi = star + 1;
      mark++;
      si = mark;
    } else {
      return false;
    }
  }

  while (pi < pattern.length && pattern[pi] === "*") pi++;
  return pi === pattern.length;
}
