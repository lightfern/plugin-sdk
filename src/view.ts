// What a plugin view imports, served to the frame as `lightfern:host`. It is the root
// barrel plus the React bindings: the root stays React-free because the host's
// Node-side tooling imports it, where react is neither wanted nor resolvable.

export * from "./index";
export { useCurrentUser, useFile, useFileObjectUrl, usePath } from "./react";
