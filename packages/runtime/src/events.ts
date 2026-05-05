import type { Tool, Resource, Prompt } from '@mcify/core';

/**
 * Telemetry events emitted by the runtime. Subscribed to by the inspector
 * (for live UI), audit log sinks, or custom tooling. Decoupled from the
 * dispatch path — emission is best-effort and never throws.
 */

export interface ToolCalledEvent {
  type: 'tool:called';
  /** Stable monotonically-increasing event id within a process. */
  id: string;
  timestamp: string;
  toolName: string;
  /** Input as sent by the client (post-validation). */
  args: unknown;
  /** Returned value from the handler (post-output validation). */
  result?: unknown;
  /** Set if the call failed. */
  error?: { message: string; phase?: string };
  /** Time spent inside the handler in ms. */
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

export type RuntimeEventListener = (event: RuntimeEvent) => void;

export type EventBusErrorHandler = (error: unknown, event: RuntimeEvent) => void;

export interface EventBusOptions {
  /**
   * Called when a listener throws during {@link EventBus.emit}. Errors are
   * isolated so one bad listener can't stop delivery to siblings, but they
   * are never silently swallowed. Default: writes to `console.error`.
   * Pass a custom handler to route through your logger.
   */
  onListenerError?: EventBusErrorHandler;
}

const defaultListenerErrorHandler: EventBusErrorHandler = (error, event) => {
  console.error('[mcify EventBus] listener threw while handling', event.type, error);
};

/**
 * Tiny pub/sub for runtime telemetry. We don't use Node's `EventEmitter` —
 * it's not Workers-friendly, and we want strict typing without the `any`
 * implicit on `.on()`.
 */
export class EventBus {
  private readonly listeners = new Set<RuntimeEventListener>();
  private readonly onListenerError: EventBusErrorHandler;
  private counter = 0;

  constructor(options: EventBusOptions = {}) {
    this.onListenerError = options.onListenerError ?? defaultListenerErrorHandler;
  }

  on(listener: RuntimeEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: RuntimeEvent): void {
    // Snapshot listeners so a listener that unsubscribes mid-emit doesn't skip siblings.
    const snapshot = [...this.listeners];
    for (const listener of snapshot) {
      try {
        listener(event);
      } catch (e) {
        // Errors are isolated — the bus must keep delivering — but we
        // never silently swallow. The handler decides what to do.
        this.onListenerError(e, event);
      }
    }
  }

  /** Generate a sortable, process-unique id for an event. */
  nextId(): string {
    this.counter += 1;
    return `evt-${Date.now().toString(36)}-${this.counter.toString(36)}`;
  }

  /** Number of active listeners. Useful for skipping work when nobody's listening. */
  listenerCount(): number {
    return this.listeners.size;
  }
}

/**
 * Snapshot of a config — what the inspector renders in its Tools/Resources/Prompts
 * tabs. Computed once per config load, not per request.
 */
export interface ConfigSnapshot {
  name: string;
  version: string;
  description?: string;
  tools: {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    outputSchema: Record<string, unknown>;
  }[];
  resources: {
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
    isTemplate: boolean;
    paramsSchema?: Record<string, unknown>;
  }[];
  prompts: {
    name: string;
    description?: string;
    argumentsSchema?: Record<string, unknown>;
  }[];
}

export const buildConfigSnapshot = (config: {
  name: string;
  version: string;
  description?: string;
  tools?: readonly Tool[];
  resources?: readonly Resource[];
  prompts?: readonly Prompt[];
}): ConfigSnapshot => ({
  name: config.name,
  version: config.version,
  ...(config.description ? { description: config.description } : {}),
  tools: (config.tools ?? []).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputJsonSchema,
    outputSchema: t.outputJsonSchema,
  })),
  resources: (config.resources ?? []).map((r) => ({
    uri: r.uri,
    name: r.name,
    ...(r.description ? { description: r.description } : {}),
    ...(r.mimeType ? { mimeType: r.mimeType } : {}),
    isTemplate: r.isTemplate,
  })),
  prompts: (config.prompts ?? []).map((p) => ({
    name: p.name,
    ...(p.description ? { description: p.description } : {}),
    ...(p.argumentsJsonSchema ? { argumentsSchema: p.argumentsJsonSchema } : {}),
  })),
});
