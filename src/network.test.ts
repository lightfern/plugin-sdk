import { describe, expect, it } from "vitest";

import { validateNetworkPermission } from "./network";

describe("validateNetworkPermission", () => {
  it.each([
    "https://api.example.com",
    "https://*.example.com",
    "https://localhost",
    "https://localhost:8443",
    "https://api.example.com:443",
    "https://api-v2.example.com",
    "https://192.168.1.10",
  ])("accepts %s", (value) => {
    expect(validateNetworkPermission(value)).toBeNull();
  });

  it.each([
    "",
    "http://insecure.example.com",
    // WebSocket origins are reserved until a network path that can carry them exists.
    "wss://stream.example.com",
    "ws://insecure.example.com",
    "https://api.example.com/v1",
    "https://api.example.com/",
    "https://api.example.com?q=1",
    "https://*",
    "https://*.",
    "*.example.com",
    "https://api.*.example.com",
    "https://API.example.com",
    "https://user@example.com",
    "https://a..example.com",
    "https://-bad.example.com",
    "https://example.com.",
    "https://example.com:",
    "https://example.com:443443",
  ])("rejects %s", (value) => {
    expect(validateNetworkPermission(value)).toMatch(/https origin/);
  });

  // The reason the grammar exists: the URL parser accepts these, and joined into a
  // CSP header they would add or terminate directives.
  it.each([
    "https://a.com;img-src *",
    "https://a.com;worker-src *",
    "https://a.com b.com",
    "https://a.com;",
  ])("rejects CSP metacharacters in %s", (value) => {
    expect(validateNetworkPermission(value)).not.toBeNull();
  });
});
