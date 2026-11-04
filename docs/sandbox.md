# The sandboxed iframe

Your view runs in this iframe, on desktop and on a [link](guide.md#on-a-link):

```html
<iframe
  sandbox="allow-scripts allow-popups allow-pointer-lock"
  allow="clipboard-read *; clipboard-write *; screen-wake-lock *; fullscreen *; accelerometer *; gyroscope *; magnetometer *"
></iframe>
```

Anything the sandbox and the content security policy don't grant is off. Standard browser APIs that
need no grant work as in any page. `camera` and `microphone` are added to `allow` when your manifest
declares them in `permissions`.

## What's blocked

- **Native dialogs.** `alert`, `confirm` and `prompt` do nothing. Render dialogs as UI in your own
  tree.
- **Forms.** The sandbox has no `allow-forms`, so a `<form>` submits nothing. Hold input in state
  and act on a button's `onClick`.
- **Remote and inline scripts.** Only the app's bundled code and its declared `dependencies` run.
  Inline styles are allowed, so CSS-in-JS libraries work.
- **WebSockets.** Server code is the way to share live state; see [Multiplayer](multiplayer.md).
- **Files and rooms from the view.** Go through [server code](server.md).

## Network and CORS

Declaring an origin in `network_permissions` lets your `fetch` leave the frame, and the server still
decides whether you can read the response. The frame has an opaque origin: it sends `Origin: null`
and no cookies. So:

- APIs built for browser use (GitHub, OpenAI, Slack, Airtable) work.
- APIs that never send `Access-Control-Allow-Origin` (for example Notion) don't, and no manifest
  entry changes that.
- Authenticate with a token the app got itself, such as an `Authorization` header from a key the
  person pasted into your settings UI. There is no cookie jar.

## Opening links

`window.open(url)` and an `<a href>` to an `http`, `https` or `mailto` URL open in the person's
default browser on desktop, where their real sessions live, not in a window inside Lightfern. On a
link, `window.open` opens a new browser tab.

## Camera and microphone

Declare `camera` or `microphone` in `permissions`, then call
`navigator.mediaDevices.getUserMedia()`. Without the permission, the call rejects.

The first time a view uses either, macOS asks the person to allow Lightfern. If they refuse,
`getUserMedia` rejects with `NotAllowedError`, so show what went wrong. Call `stop()` on every track
when you finish, so the camera light turns off.

## Motion sensors

Listen for `devicemotion` and `deviceorientation`. Safari has no `Accelerometer` or `Gyroscope`
classes, so the events are the way that works everywhere.

On an iPhone or iPad, no events arrive until `DeviceMotionEvent.requestPermission()` has been called
from a tap. Call it in the tap's handler before any `await`: once the handler has waited on
something, Safari no longer counts the call as coming from the tap. The tap can be any button the
person presses anyway, so the view needn't add an "Allow motion" step.

```ts
button.onclick = () => {
  const motion = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
  // Ask first, before anything else in the handler waits.
  void (motion.requestPermission?.() ?? Promise.resolve("granted")).then(() =>
    window.addEventListener("devicemotion", onMotion)
  );
};
```

Macs have no motion sensors, so in the desktop app no events arrive, although it still defines
`DeviceMotionEvent`. To tell whether a device can steer by tilting, check for a touch screen
(`navigator.maxTouchPoints > 0 && matchMedia("(pointer: coarse)").matches`) or wait for the first
event. Phones and tablets on a link do have sensors. Keep the view usable without them.

To read tilt, use `accelerationIncludingGravity`: at rest it points along gravity in the device's
own axes. Browsers haven't always agreed on its sign, so measure tilt as a change from a reading
taken when the person starts, such as the angle of `atan2(x, y)` for a phone held like a steering
wheel.

## Background workers

Use a web worker for CPU-heavy work that would freeze the view. The view's opaque origin means
`new Worker("worker.js")` can't load a file from the app. Create the worker from a blob URL:

```ts
const workerUrl = URL.createObjectURL(
  new Blob(["self.onmessage = ({ data }) => self.postMessage(data * 2)"], {
    type: "text/javascript",
  })
);
const worker = new Worker(workerUrl);
```

Workers can't reach the view's DOM or `ctx`, and inherit its content security policy. Call
`worker.terminate()` and `URL.revokeObjectURL(workerUrl)` when done. A blob worker runs whatever
JavaScript is in the blob, so use code bundled with the app, and never turn a network response into
worker code.

## Keyboard shortcuts

On desktop, a keydown your view doesn't handle bubbles up to Lightfern, so its shortcuts (switch
tab, quick open, find) keep working while your view has focus. To claim a chord, call
`event.preventDefault()` in your handler, which stops the key reaching Lightfern. Don't forward keys
yourself.

## Text selection

On desktop, text selected in your view is offered to Lightfern's assistant as context, as a
selection in a note is. Lightfern reads it once it settles and clears it when the selection
collapses or the person opens another node. Use `user-select: none` for chrome that shouldn't be
quoted, such as labels and toolbars.

## On a link

The same iframe runs, with these differences:

- Clipboard, camera, microphone and geolocation are blocked. Motion sensors work.
- `window.open` opens a new browser tab.

## How the host talks to the view

The host can't authenticate a sandboxed view by `event.origin`. On load the view posts a ready
message to its parent, and the host replies with a transferred `MessagePort`. Every later call
(`ctx.open` and each call to server code) is an RPC over that port, checked against the manifest.
`connect()` does this handshake. The message shapes are in [`src/protocol.ts`](../src/protocol.ts)
for anyone building tooling.
