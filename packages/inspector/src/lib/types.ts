/**
 * Local copies of the runtime's event types so the inspector frontend builds
 * without pulling Node-only modules (`pino`, `ws`) through the @mcify/runtime
 * import surface. Keep these in lockstep with `packages/runtime/src/events.ts`.
 */

export interface ToolCalledEvent {
  type: 'tool:called';
  id: string;
  timestamp: string;
  toolName: string;
  args: unknown;
  result?: unknown;
  error?: { message: string; phase?: string };
  durationMs: number;
}

export interface ResourceReadEvent {
  type: 'resource:read';
  id: string;
  timestamp: string;
  uri: string;
  params?: Record<string, string> | null;
  durationMs: number;
  error?: { message: string };
}

export interface PromptRenderedEvent {
  type: 'prompt:rendered';
  id: string;
  timestamp: string;
  promptName: string;
  args?: unknown;
  durationMs: number;
  error?: { message: string };
}

export interface ConfigLoadedEvent {
  type: 'config:loaded';
  id: string;
  timestamp: string;
  serverName: string;
  serverVersion: string;
  toolCount: number;
  resourceCount: number;
  promptCount: number;
}

export type RuntimeEvent =
  | ToolCalledEvent
  | ResourceReadEvent
  | PromptRenderedEvent
  | ConfigLoadedEvent;

export interface ToolSnapshot {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

export interface ResourceSnapshot {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  isTemplate: boolean;
}

export interface PromptSnapshot {
  name: string;
  description?: string;
  argumentsSchema?: Record<string, unknown>;
}

export interface ServerSnapshot {
  runtime: 'mcify';
  runtimeVersion: string;
  name: string;
  version: string;
  description?: string;
  tools: ToolSnapshot[];
  resources: ResourceSnapshot[];
  prompts: PromptSnapshot[];
}
