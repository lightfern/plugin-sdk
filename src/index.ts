export { connect, PluginRpcError } from "./client";
export type { FilesApi, FileWriteOptions, ViewContext } from "./context";
export type {
  FilePermission,
  ManifestVersion,
  PluginContributions,
  PluginDependencies,
  PluginManifest,
  PluginPermission,
  ViewContribution,
} from "./manifest";
export { MANIFEST_VERSION, manifestEntries } from "./manifest";
export {
  formatManifestErrors,
  manifestSchema,
  type ParsedManifest,
  parseManifest,
  safeParseManifest,
} from "./manifestSchema";
export { matchesPattern, validateMatchPattern } from "./match";
export { validateNetworkPermission } from "./network";
export type {
  FileChange,
  FileEncoding,
  FileEntry,
  FilesChangedMessage,
  FilesDeleteParams,
  FilesListParams,
  FilesMoveParams,
  FilesReadParams,
  FilesWriteParams,
  HostInitMessage,
  HostPushMessage,
  HostSelectionMessage,
  OpenParams,
  PathChangedMessage,
  RpcError,
  RpcMethod,
  RpcRequest,
  RpcResponse,
  SerializableContext,
  ViewFixRequestMessage,
  ViewKeyDownMessage,
  ViewMessage,
  ViewReadyMessage,
  ViewSelectionMessage,
} from "./protocol";
