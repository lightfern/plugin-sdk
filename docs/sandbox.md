# The sandboxed iframe

Your view runs in this iframe:

```html
<iframe sandbox="allow-scripts allow-popups" allow="clipboard-read; clipboard-write"></iframe>
```

That is the whole browser-capability surface: assume an API works only if those attributes grant it.
Everything else goes through the plugin API: files via `ctx.files`, navigation via `ctx.open`,
network to the origins in `network_permissions`. Render dialogs as React UI in your own tree; native
`alert`/`confirm`/`prompt` are off.

**Network requests are subject to CORS.** Declaring an origin lets your `fetch` leave the frame, but
the server still decides whether you can read the response, and the frame sends `Origin: null` with
no cookies. In practice: APIs built for browser use (GitHub, OpenAI, Slack, Airtable, …) work; APIs
that never send `Access-Control-Allow-Origin` (for example Notion) do not, and no manifest entry
changes that. WebSockets are not supported. Authenticate by sending a token the plugin obtained
itself (e.g. an `Authorization` header from a key the user pasted into your settings UI); there is
no cookie jar.

Don't use `<form>`. The sandbox has no `allow-forms`, so submission does nothing (no navigation, no
request), and you never need it. Hold input in React state and act on a button `onClick`.

`window.open(url)` and an `<a href>` to an `http`/`https`/`mailto` URL open in the user's default
browser (where their real sessions live), not a window inside Lightfern.

## How the host talks to the view

A sandboxed iframe has an opaque origin, so the host cannot authenticate the view by `event.origin`.
Instead, on load the view posts a ready message to its parent and the host replies with a
transferred `MessagePort`; every later call (`ctx.files.*`, `ctx.open`) is an RPC over that port,
and holding the port is what proves the channel. Each RPC is permission-checked on the host side
against the manifest, so the capability list in `permissions` is exactly what a view can reach.
`connect()` performs this handshake for you; the message shapes are in
[`src/protocol.ts`](../src/protocol.ts) for anyone building tooling on either side.

## Keyboard shortcuts

A keydown your view does not handle bubbles up to Lightfern, so the app's own shortcuts (switch tab,
quick open, find, …) keep working while your view holds focus. To claim a chord for yourself, call
`event.preventDefault()` in your handler; that is the signal that stops the key from reaching the
host. A key you leave alone is passed through; you never need to re-implement or forward app
shortcuts yourself.

## Text selection

Text a user selects in your view is offered to Lightfern's assistant as context, the same way a
selection in a note is. Nothing to wire: Lightfern reads the document selection once it settles and
clears it when the selection collapses or the user opens another node. Chrome that should never be
quoted (labels, toolbars) is what `user-select: none` is for; leave content selectable.
