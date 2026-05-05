import type { Config, HandlerContext, Resource, Tool, Prompt } from '@mcify/core';
import { McifyValidationError } from '@mcify/core';
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

export const matchUriTemplate = (
  template: string,
  uri: string,
): Record<string, string> | null => {
  // Build the regex by walking the template: literal slices get escaped,
  // `{name}` placeholders become named capture groups. Doing it in one pass
  // avoids double-escaping the braces themselves.
  const parts: string[] = [];
  let lastIndex = 0;
  // Reset lastIndex on the shared regex literal.
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
  for (const r of config.resources ?? []) {
    if (!r.isTemplate && r.uri === uri) {
      return { resource: r, params: null };
    }
  }
  for (const r of config.resources ?? []) {
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

const handleCallTool = async (
  config: Config,
  ctx: HandlerContext,
  params: { name: string; arguments?: unknown },
) => {
  const tool = config.tools?.find((t) => t.name === params.name);
  if (!tool) {
    return null; // signal not-found via outer try/catch
  }
  try {
    const result = await tool.invoke(params.arguments ?? {}, ctx);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    };
  } catch (e) {
    if (e instanceof McifyValidationError) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: `validation error (${e.phase}): ${e.message}` }],
      };
    }
    return {
      isError: true,
      content: [
        { type: 'text' as const, text: e instanceof Error ? e.message : 'tool execution failed' },
      ],
    };
  }
};

const handleListResources = (config: Config) => ({
  resources: (config.resources ?? [])
    .filter((r) => !r.isTemplate)
    .map(toMcpResourceListItem),
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
) => {
  const match = findResourceForUri(config, params.uri);
  if (!match) return null;
  const content = await match.resource.read(match.params ?? {}, ctx);
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
};

const handleListPrompts = (config: Config) => ({
  prompts: (config.prompts ?? []).map(toMcpPromptListItem),
});

const handleGetPrompt = async (
  config: Config,
  ctx: HandlerContext,
  params: { name: string; arguments?: unknown },
) => {
  const prompt = config.prompts?.find((p) => p.name === params.name);
  if (!prompt) return null;
  const messages = await prompt.render(params.arguments ?? {}, ctx);
  return {
    ...(prompt.description ? { description: prompt.description } : {}),
    messages: messages.map((m) => ({
      role: m.role,
      content: typeof m.content === 'string' ? { type: 'text', text: m.content } : m.content,
    })),
  };
};

export const dispatch = async (
  raw: unknown,
  config: Config,
  ctx: HandlerContext,
): Promise<JsonRpcResponse | null> => {
  if (!isJsonRpcRequest(raw)) {
    return err(null, Codes.InvalidRequest, 'Invalid JSON-RPC request');
  }

  const request: JsonRpcRequest = raw;
  const id: JsonRpcId = request.id ?? null;
  const notification = isNotification(request);

  try {
    switch (request.method) {
      case 'initialize':
        return notification ? null : ok(id, handleInitialize(config));

      case 'notifications/initialized':
      case 'notifications/cancelled':
        return null;

      case 'ping':
        return notification ? null : ok(id, {});

      case 'tools/list':
        return notification ? null : ok(id, handleListTools(config));

      case 'tools/call': {
        const params = (request.params ?? {}) as { name?: string; arguments?: unknown };
        if (!params.name) return err(id, Codes.InvalidParams, '`name` is required');
        const result = await handleCallTool(config, ctx, {
          name: params.name,
          arguments: params.arguments,
        });
        if (result === null) {
          return err(id, Codes.NotFound, `Tool not found: ${params.name}`);
        }
        return notification ? null : ok(id, result);
      }

      case 'resources/list':
        return notification ? null : ok(id, handleListResources(config));

      case 'resources/templates/list':
        return notification ? null : ok(id, handleListResourceTemplates(config));

      case 'resources/read': {
        const params = (request.params ?? {}) as { uri?: string };
        if (!params.uri) return err(id, Codes.InvalidParams, '`uri` is required');
        const result = await handleReadResource(config, ctx, { uri: params.uri });
        if (result === null) {
          return err(id, Codes.NotFound, `Resource not found: ${params.uri}`);
        }
        return notification ? null : ok(id, result);
      }

      case 'prompts/list':
        return notification ? null : ok(id, handleListPrompts(config));

      case 'prompts/get': {
        const params = (request.params ?? {}) as { name?: string; arguments?: unknown };
        if (!params.name) return err(id, Codes.InvalidParams, '`name` is required');
        const result = await handleGetPrompt(config, ctx, {
          name: params.name,
          arguments: params.arguments,
        });
        if (result === null) {
          return err(id, Codes.NotFound, `Prompt not found: ${params.name}`);
        }
        return notification ? null : ok(id, result);
      }

      default:
        return notification ? null : err(id, Codes.MethodNotFound, `Method not found: ${request.method}`);
    }
  } catch (e) {
    if (notification) return null;
    if (e instanceof McifyValidationError) {
      return err(id, Codes.InvalidParams, e.message, { phase: e.phase, issues: e.issues });
    }
    return err(id, Codes.InternalError, e instanceof Error ? e.message : 'Internal error');
  }
};
