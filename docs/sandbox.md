# The sandbox

A view runs in a sandboxed iframe, in the desktop app and on a [link](guide.md#on-a-link). Browser
APIs work as in any web page, except for what's below.

## What's blocked

- **Native dialogs.** `alert`, `confirm` and `prompt` do nothing. Draw dialogs yourself.
- **Forms.** A `<form>` doesn't submit. Act on a button's `onClick` instead.
- **Remote and inline scripts.** Only the app's bundled code and its declared `dependencies` run.
  Inline styles are fine, so CSS-in-JS libraries work.
- **WebSockets.** Share live state through server code; see [Multiplayer](multiplayer.md).
- **Files and rooms.** A view reaches them only through [server code](server.md).
- **Geolocation.**

## Network

`fetch` reaches only the origins in `network_permissions`. The frame has an opaque origin, so its
requests send `Origin: null` and no cookies. An API must allow cross-origin requests: most built for
browsers do, and some, like Notion's, don't. Authenticate with a token the app holds, such as a key
the person pasted into its settings.

## Background workers

The opaque origin also means `new Worker("worker.js")` can't load a file. Create a worker from a
blob URL of code bundled with the app, and never from a network response:

```ts
const worker = new Worker(URL.createObjectURL(new Blob([source], { type: "text/javascript" })));
```

## Camera and microphone

Declare `camera` or `microphone` in the manifest's `permissions`. Without it, `getUserMedia`
rejects. The first time, macOS asks the person to allow Lightfern in the desktop app, and the
browser asks on a link.

## Motion sensors

`devicemotion` and `deviceorientation` events work. On an iPhone or iPad, call
`DeviceMotionEvent.requestPermission()` from a tap's handler, before it awaits anything. Macs have
no motion sensors, so keep the view usable without them.

## Opening links

On desktop, `window.open(url)` and links to `http`, `https` and `mailto` URLs open in the person's
default browser. On a link, they open a new tab.

## Keyboard shortcuts

On desktop, a key your view doesn't handle reaches Lightfern, so its shortcuts keep working. Call
`event.preventDefault()` to keep a key for your view.

## Text selection

On desktop, text selected in a view is offered to Lightfern's assistant as context. Use
`user-select: none` on labels and toolbars.
