// Public version
export { RUNTIME_VERSION as version, MCP_PROTOCOL_VERSION } from './version.js';

// Dispatch (low-level, useful for custom transports)
export { dispatch, matchUriTemplate } from './dispatch.js';

// HTTP transport
export { createHttpApp, createHttpHandler } from './http.js';
export type { HttpHandlerOptions, FetchHandler, EnvProvider } from './http.js';

// Stdio transport
export { serveStdio } from './stdio.js';
export type { StdioServeOptions } from './stdio.js';

// SDK server (used by stdio, exported for advanced cases)
export { buildSdkServer } from './sdk-server.js';
export type { SdkServerOptions } from './sdk-server.js';

// Runtime adapters — re-exported for convenience.
// For tree-shaking, prefer `@mcify/runtime/node`, `@mcify/runtime/bun`, `@mcify/runtime/workers`.
export type { NodeServeOptions, NodeServer } from './adapters/node.js';
export type { BunServeOptions, BunServer } from './adapters/bun.js';
export type { WorkersFetchHandler, WorkersHandlerOptions } from './adapters/workers.js';

// Auth
export {
  McifyAuthError,
  resolveAuthFromHeaders,
  getProcessEnv,
  constantTimeEqual,
} from './auth.js';
export type { EnvSource } from './auth.js';

// Context + logger
export { buildHandlerContext } from './context.js';
export type { BuildContextOptions } from './context.js';
export { createConsoleLogger } from './logger.js';
export type { ConsoleLoggerOptions, LogLevel } from './logger.js';
export { createPinoLogger } from './logger-pino.js';
export type { PinoLoggerOptions, PinoLogLevel } from './logger-pino.js';

// JSON-RPC primitives (useful when integrating with custom transports)
export { ok, err, isJsonRpcRequest, isNotification, JsonRpcErrorCodes } from './jsonrpc.js';
export type {
  JsonRpcId,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcSuccess,
  JsonRpcError,
  JsonRpcErrorBody,
} from './jsonrpc.js';

// Telemetry / event bus
export { EventBus, buildConfigSnapshot } from './events.js';
export type {
  RuntimeEvent,
  RuntimeEventListener,
  EventBusOptions,
  EventBusErrorHandler,
  ToolCalledEvent,
  ResourceReadEvent,
  PromptRenderedEvent,
  ConfigLoadedEvent,
  ConfigSnapshot,
} from './events.js';
