import type { Config, HandlerContext, Resource, Tool, Prompt } from '@mcify/core';
import { McifyValidationError } from '@mcify/core';
import {
  CallToolRequestParamsSchema,
  GetPromptRequestParamsSchema,
  InitializeRequestParamsSchema,
  ReadResourceRequestParamsSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { EventBus } from './events.js';
import {
  err,
  isJsonRpcRequest,
  isNotification,
  JsonRpcErrorCodes as Codes,
  ok,
  type JsonRpcId,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from './jsonrpc.js';
import { MCP_PROTOCOL_VERSION } from './version.js';

const buildCapabilities = (config: Config): Record<string, unknown> => {
  const capabilities: Record<string, unknown> = {};
  if (config.tools && config.tools.length > 0) capabilities['tools'] = {};
  if (config.resources && config.resources.length > 0) capabilities['resources'] = {};
  if (config.prompts && config.prompts.length > 0) capabilities['prompts'] = {};
  return capabilities;
};

const toMcpToolListItem = (tool: Tool) => ({
  name: tool.name,
  description: tool.description,
  inputSchema: tool.inputJsonSchema,
});

const toMcpResourceListItem = (resource: Resource) => ({
  uri: resource.uri,
  name: resource.name,
  ...(resource.description ? { description: resource.description } : {}),
  ...(resource.mimeType ? { mimeType: resource.mimeType } : {}),
});

const toMcpPromptListItem = (prompt: Prompt) => ({
  name: prompt.name,
  ...(prompt.description ? { description: prompt.description } : {}),
  ...(prompt.argumentsJsonSchema ? { argumentsSchema: prompt.argumentsJsonSchema } : {}),
});

const PLACEHOLDER_PATTERN = /\{([^/{}]+)\}/g;

const escapeRegex = (s: string): string => s.replace(/[.+?^$()|[\]\\]/g, (c) => `\\${c}`);

export const matchUriTemplate = (template: string, uri: string): Record<string, string> | null => {
  // Build the regex by walking the template: literal slices get escaped,
  // `{name}` placeholders become named capture groups. Doing it in one pass
  // avoids double-escaping the braces themselves.
  const parts: string[] = [];
  let lastIndex = 0;
  const re = new RegExp(PLACEHOLDER_PATTERN.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(template)) !== null) {
    parts.push(escapeRegex(template.slice(lastIndex, match.index)));
    parts.push(`(?<${match[1]}>.+?)`);
    lastIndex = match.index + match[0].length;
  }
  parts.push(escapeRegex(template.slice(lastIndex)));
  const compiled = new RegExp(`^${parts.join('')}$`);
  const result = compiled.exec(uri);
  if (!result || !result.groups) return null;
  return { ...result.groups };
};

const findResourceForUri = (
  config: Config,
  uri: string,
): { resource: Resource; params: Record<string, string> | null } | null => {
  const resources = config.resources ?? [];
  for (const r of resources) {
    if (!r.isTemplate && r.uri === uri) {
      return { resource: r, params: null };
    }
  }
  for (const r of resources) {
    if (r.isTemplate) {
      const params = matchUriTemplate(r.uri, uri);
      if (params) return { resource: r, params };
    }
  }
  return null;
};

const handleInitialize = (config: Config) => ({
  protocolVersion: MCP_PROTOCOL_VERSION,
  capabilities: buildCapabilities(config),
  serverInfo: { name: config.name, version: config.version },
});

const handleListTools = (config: Config) => ({
  tools: (config.tools ?? []).map(toMcpToolListItem),
});

interface CallToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

const emitToolCalled = (
  eventBus: EventBus | undefined,
  toolName: string,
  args: unknown,
  startMs: number,
  outcome: { result: unknown } | { error: { message: string; phase?: string } },
): void => {
  if (!eventBus || eventBus.listenerCount() === 0) return;
  const durationMs = Date.now() - startMs;
  eventBus.emit({
    type: 'tool:called',
    id: eventBus.nextId(),
    timestamp: new Date().toISOString(),
    toolName,
    args,
    durationMs,
    ...('result' in outcome ? { result: outcome.result } : { error: outcome.error }),
  });
};

const handleCallTool = async (
  config: Config,
  ctx: HandlerContext,
  params: { name: string; arguments?: unknown },
  eventBus?: EventBus,
): Promise<CallToolResult | null> => {
  const tool = config.tools?.find((t) => t.name === params.name);
  if (!tool) return null;
  const start = Date.now();
  const args = params.arguments ?? {};
  try {
    const result = await tool.invoke(args, ctx);
    emitToolCalled(eventBus, tool.name, args, start, { result });
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
  } catch (e) {
    if (e instanceof McifyValidationError) {
      emitToolCalled(eventBus, tool.name, args, start, {
        error: { message: e.message, phase: e.phase },
      });
      return {
        isError: true,
        content: [{ type: 'text' as const, text: `validation error (${e.phase}): ${e.message}` }],
      };
    }
    const message = e instanceof Error ? e.message : 'tool execution failed';
    emitToolCalled(eventBus, tool.name, args, start, { error: { message } });
    return {
      isError: true,
      content: [{ type: 'text' as const, text: message }],
    };
  }
};

const handleListResources = (config: Config) => ({
  resources: (config.resources ?? []).filter((r) => !r.isTemplate).map(toMcpResourceListItem),
});

const handleListResourceTemplates = (config: Config) => ({
  resourceTemplates: (config.resources ?? [])
    .filter((r) => r.isTemplate)
    .map((r) => ({
      uriTemplate: r.uri,
      name: r.name,
      ...(r.description ? { description: r.description } : {}),
      ...(r.mimeType ? { mimeType: r.mimeType } : {}),
    })),
});

const handleReadResource = async (
  config: Config,
  ctx: HandlerContext,
  params: { uri: string },
  eventBus?: EventBus,
) => {
  const match = findResourceForUri(config, params.uri);
  if (!match) return null;
  const start = Date.now();
  try {
    const content = await match.resource.read(match.params ?? {}, ctx);
    if (eventBus && eventBus.listenerCount() > 0) {
      eventBus.emit({
        type: 'resource:read',
        id: eventBus.nextId(),
        timestamp: new Date().toISOString(),
        uri: params.uri,
        params: match.params,
        durationMs: Date.now() - start,
      });
    }
    return {
      contents: [
        {
          uri: params.uri,
          mimeType: content.mimeType,
          ...(content.text !== undefined ? { text: content.text } : {}),
          ...(content.blob !== undefined ? { blob: content.blob } : {}),
        },
      ],
    };
  } catch (e) {
    if (eventBus && eventBus.listenerCount() > 0) {
      eventBus.emit({
        type: 'resource:read',
        id: eventBus.nextId(),
        timestamp: new Date().toISOString(),
        uri: params.uri,
        params: match.params,
        durationMs: Date.now() - start,
        error: { message: e instanceof Error ? e.message : 'resource read failed' },
      });
    }
    throw e;
  }
};

const handleListPrompts = (config: Config) => ({
  prompts: (config.prompts ?? []).map(toMcpPromptListItem),
});

const handleGetPrompt = async (
  config: Config,
  ctx: HandlerContext,
  params: { name: string; arguments?: unknown },
  eventBus?: EventBus,
) => {
  const prompt = config.prompts?.find((p) => p.name === params.name);
  if (!prompt) return null;
  const start = Date.now();
  const args = params.arguments ?? {};
  try {
    const messages = await prompt.render(args, ctx);
    if (eventBus && eventBus.listenerCount() > 0) {
      eventBus.emit({
        type: 'prompt:rendered',
        id: eventBus.nextId(),
        timestamp: new Date().toISOString(),
        promptName: prompt.name,
        args,
        durationMs: Date.now() - start,
      });
    }
    return {
      ...(prompt.description ? { description: prompt.description } : {}),
      messages: messages.map((m) => ({
        role: m.role,
        content: typeof m.content === 'string' ? { type: 'text', text: m.content } : m.content,
      })),
    };
  } catch (e) {
    if (eventBus && eventBus.listenerCount() > 0) {
      eventBus.emit({
        type: 'prompt:rendered',
        id: eventBus.nextId(),
        timestamp: new Date().toISOString(),
        promptName: prompt.name,
        args,
        durationMs: Date.now() - start,
        error: { message: e instanceof Error ? e.message : 'prompt render failed' },
      });
    }
    throw e;
  }
};

/**
 * The official MCP SDK ships with internal Zod schemas whose generic
 * parameters are not assignable to our `zod@3` types. We only depend on
 * `safeParse`, so use a structural type that ignores the heavy generics.
 */
interface SafeParseable<T> {
  safeParse(
    input: unknown,
  ): { success: true; data: T } | { success: false; error: { issues: readonly unknown[] } };
}

interface ParseOk<T> {
  ok: true;
  data: T;
}
interface ParseFail {
  ok: false;
  issues: readonly unknown[];
}

const parseParams = <T>(schema: SafeParseable<T>, rawParams: unknown): ParseOk<T> | ParseFail => {
  const result = schema.safeParse(rawParams ?? {});
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, issues: result.error.issues };
};

export interface DispatchOptions {
  /** Optional event bus that receives tool/resource/prompt telemetry. */
  eventBus?: EventBus;
}

export const dispatch = async (
  raw: unknown,
  config: Config,
  ctx: HandlerContext,
  options: DispatchOptions = {},
): Promise<JsonRpcResponse | null> => {
  const { eventBus } = options;
  if (!isJsonRpcRequest(raw)) {
    return err(null, Codes.InvalidRequest, 'Invalid JSON-RPC request');
  }

  const request: JsonRpcRequest = raw;
  const id: JsonRpcId = request.id ?? null;
  const notification = isNotification(request);

  try {
    switch (request.method) {
      case 'initialize': {
        const parsed = parseParams(InitializeRequestParamsSchema, request.params);
        if (!parsed.ok) {
          return notification
            ? null
            : err(id, Codes.InvalidParams, 'Invalid initialize params', { issues: parsed.issues });
        }
        return notification ? null : ok(id, handleInitialize(config));
      }

      case 'notifications/initialized':
      case 'notifications/cancelled':
        return null;

      case 'ping':
        return notification ? null : ok(id, {});

      case 'tools/list':
        return notification ? null : ok(id, handleListTools(config));

      case 'tools/call': {
        const parsed = parseParams(CallToolRequestParamsSchema, request.params);
        if (!parsed.ok) {
          return notification
            ? null
            : err(id, Codes.InvalidParams, 'Invalid tools/call params', { issues: parsed.issues });
        }
        const { name, arguments: args } = parsed.data;
        const result = await handleCallTool(config, ctx, { name, arguments: args }, eventBus);
        if (result === null) {
          return err(id, Codes.NotFound, `Tool not found: ${name}`);
        }
        return notification ? null : ok(id, result);
      }

      case 'resources/list':
        return notification ? null : ok(id, handleListResources(config));

      case 'resources/templates/list':
        return notification ? null : ok(id, handleListResourceTemplates(config));

      case 'resources/read': {
        const parsed = parseParams(ReadResourceRequestParamsSchema, request.params);
        if (!parsed.ok) {
          return notification
            ? null
            : err(id, Codes.InvalidParams, 'Invalid resources/read params', {
                issues: parsed.issues,
              });
        }
        const result = await handleReadResource(config, ctx, { uri: parsed.data.uri }, eventBus);
        if (result === null) {
          return err(id, Codes.NotFound, `Resource not found: ${parsed.data.uri}`);
        }
        return notification ? null : ok(id, result);
      }

      case 'prompts/list':
        return notification ? null : ok(id, handleListPrompts(config));

      case 'prompts/get': {
        const parsed = parseParams(GetPromptRequestParamsSchema, request.params);
        if (!parsed.ok) {
          return notification
            ? null
            : err(id, Codes.InvalidParams, 'Invalid prompts/get params', {
                issues: parsed.issues,
              });
        }
        const result = await handleGetPrompt(
          config,
          ctx,
          { name: parsed.data.name, arguments: parsed.data.arguments },
          eventBus,
        );
        if (result === null) {
          return err(id, Codes.NotFound, `Prompt not found: ${parsed.data.name}`);
        }
        return notification ? null : ok(id, result);
      }

      default:
        return notification
          ? null
          : err(id, Codes.MethodNotFound, `Method not found: ${request.method}`);
    }
  } catch (e) {
    if (notification) return null;
    if (e instanceof McifyValidationError) {
      return err(id, Codes.InvalidParams, e.message, { phase: e.phase, issues: e.issues });
    }
    return err(id, Codes.InternalError, e instanceof Error ? e.message : 'Internal error');
  }
};
