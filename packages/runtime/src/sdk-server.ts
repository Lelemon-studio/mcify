import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { Config, HandlerContext } from '@mcify/core';
import { McifyValidationError } from '@mcify/core';
import { matchUriTemplate } from './dispatch.js';
import { buildHandlerContext } from './context.js';
import { createConsoleLogger } from './logger.js';

export interface SdkServerOptions {
  ctx?: () => HandlerContext;
}

const buildCapabilities = (config: Config) => {
  const capabilities: { tools?: object; resources?: object; prompts?: object } = {};
  if (config.tools && config.tools.length > 0) capabilities.tools = {};
  if (config.resources && config.resources.length > 0) capabilities.resources = {};
  if (config.prompts && config.prompts.length > 0) capabilities.prompts = {};
  return capabilities;
};

export const buildSdkServer = (config: Config, options: SdkServerOptions = {}): Server => {
  const server = new Server(
    { name: config.name, version: config.version },
    { capabilities: buildCapabilities(config) },
  );

  const stderrLogger = createConsoleLogger({
    sink: 'stderr',
    bindings: { server: config.name, transport: 'stdio' },
  });
  const ctxFactory = options.ctx ?? (() => buildHandlerContext({ logger: stderrLogger }));

  if (config.tools && config.tools.length > 0) {
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: config.tools!.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputJsonSchema as { type: 'object'; [k: string]: unknown },
      })),
    }));

    server.setRequestHandler(CallToolRequestSchema, async (req) => {
      const tool = config.tools!.find((t) => t.name === req.params.name);
      if (!tool) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Tool not found: ${req.params.name}` }],
        };
      }
      try {
        const result = await tool.invoke(req.params.arguments ?? {}, ctxFactory());
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (e) {
        if (e instanceof McifyValidationError) {
          return {
            isError: true,
            content: [{ type: 'text', text: `validation error (${e.phase}): ${e.message}` }],
          };
        }
        return {
          isError: true,
          content: [
            { type: 'text', text: e instanceof Error ? e.message : 'tool execution failed' },
          ],
        };
      }
    });
  }

  if (config.resources && config.resources.length > 0) {
    server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: config
        .resources!.filter((r) => !r.isTemplate)
        .map((r) => ({
          uri: r.uri,
          name: r.name,
          ...(r.description ? { description: r.description } : {}),
          ...(r.mimeType ? { mimeType: r.mimeType } : {}),
        })),
    }));

    server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
      resourceTemplates: config
        .resources!.filter((r) => r.isTemplate)
        .map((r) => ({
          uriTemplate: r.uri,
          name: r.name,
          ...(r.description ? { description: r.description } : {}),
          ...(r.mimeType ? { mimeType: r.mimeType } : {}),
        })),
    }));

    server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
      const uri = req.params.uri;
      let match: { resource: typeof config.resources extends readonly (infer R)[] ? R : never; params: Record<string, string> | null } | null = null;
      for (const r of config.resources!) {
        if (!r.isTemplate && r.uri === uri) {
          match = { resource: r, params: null };
          break;
        }
      }
      if (!match) {
        for (const r of config.resources!) {
          if (r.isTemplate) {
            const params = matchUriTemplate(r.uri, uri);
            if (params) {
              match = { resource: r, params };
              break;
            }
          }
        }
      }
      if (!match) {
        throw new Error(`Resource not found: ${uri}`);
      }
      const content = await match.resource.read(match.params ?? {}, ctxFactory());
      return {
        contents: [
          {
            uri,
            mimeType: content.mimeType,
            ...(content.text !== undefined ? { text: content.text } : {}),
            ...(content.blob !== undefined ? { blob: content.blob } : {}),
          },
        ],
      };
    });
  }

  if (config.prompts && config.prompts.length > 0) {
    server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: config.prompts!.map((p) => ({
        name: p.name,
        ...(p.description ? { description: p.description } : {}),
        ...(p.argumentsJsonSchema ? { argumentsSchema: p.argumentsJsonSchema } : {}),
      })),
    }));

    server.setRequestHandler(GetPromptRequestSchema, async (req) => {
      const prompt = config.prompts!.find((p) => p.name === req.params.name);
      if (!prompt) throw new Error(`Prompt not found: ${req.params.name}`);
      const messages = await prompt.render(req.params.arguments ?? {}, ctxFactory());
      return {
        ...(prompt.description ? { description: prompt.description } : {}),
        messages: messages.map((m) => ({
          role: m.role,
          content: typeof m.content === 'string' ? { type: 'text', text: m.content } : m.content,
        })),
      };
    });
  }

  return server;
};
