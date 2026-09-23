// The validator for manifest `network_permissions` entries. An entry names an origin
// the plugin may reach: `https://`, an optional `*.` subdomain wildcard, a hostname,
// and an optional port. `wss://` is deliberately not accepted yet: WebSockets would
// work straight from the frame today, but the planned brokered fetch can't carry
// them, and we don't want plugins depending on a path that model would break.
//
//   https://api.example.com     exactly this origin
//   https://*.example.com       any subdomain (not example.com itself)
//   https://localhost:8443      explicit ports allowed
//
// The grammar is an explicit regex rather than URL parsing on purpose: the WHATWG URL
// parser admits `;` and `*` inside hostnames (`new URL("https://a.com;img-src")`
// round-trips through `.origin` unchanged), and the host joins accepted entries
// verbatim into a Content-Security-Policy header — every accepted value must be inert
// there.

const HOST_LABEL = "[a-z0-9](?:[a-z0-9-]*[a-z0-9])?";
const NETWORK_PERMISSION = new RegExp(
  `^https://(?:\\*\\.)?${HOST_LABEL}(?:\\.${HOST_LABEL})*(?::\\d{1,5})?$`
);

export function validateNetworkPermission(value: string): string | null {
  if (NETWORK_PERMISSION.test(value)) return null;
  return (
    "must be an https origin, optionally with a '*.' subdomain wildcard — " +
    "e.g. https://api.example.com, https://*.example.com"
  );
}
