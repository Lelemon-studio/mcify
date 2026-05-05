import type { ZodType, z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { HandlerContext } from './context.js';
import { McifyValidationError } from './errors.js';

/**
 * MCP roles supported in prompt messages. The protocol does not currently
 * support `system` in prompts, so we don't expose it here.
 */
export type PromptRole = 'user' | 'assistant';

export interface PromptTextContent {
  type: 'text';
  text: string;
}

export interface PromptImageContent {
  type: 'image';
  data: string;
  mimeType: string;
}

export type PromptContent = PromptTextContent | PromptImageContent;

export interface PromptMessage {
  role: PromptRole;
  content: PromptContent | string;
}

export interface BasicPromptDefinition {
  name: string;
  description?: string;
  render: (ctx: HandlerContext) => PromptMessage[] | Promise<PromptMessage[]>;
}

export interface ParameterizedPromptDefinition<TArgs extends ZodType> {
  name: string;
  description?: string;
  arguments: TArgs;
  render: (
    args: z.infer<TArgs>,
    ctx: HandlerContext,
  ) => PromptMessage[] | Promise<PromptMessage[]>;
}

export interface Prompt {
  readonly __mcify: 'prompt';
  readonly name: string;
  readonly description?: string | undefined;
  readonly arguments?: ZodType | undefined;
  readonly argumentsJsonSchema?: Record<string, unknown> | undefined;
  readonly render: (rawArgs: unknown, ctx: HandlerContext) => Promise<PromptMessage[]>;
}

const PROMPT_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

const hasArguments = (
  def: BasicPromptDefinition | ParameterizedPromptDefinition<ZodType>,
): def is ParameterizedPromptDefinition<ZodType> =>
  'arguments' in def && def.arguments !== undefined;

export function definePrompt(def: BasicPromptDefinition): Prompt;
export function definePrompt<TArgs extends ZodType>(
  def: ParameterizedPromptDefinition<TArgs>,
): Prompt;
export function definePrompt(
  def: BasicPromptDefinition | ParameterizedPromptDefinition<ZodType>,
): Prompt {
  if (!def.name) throw new TypeError('definePrompt: `name` is required');
  if (!PROMPT_NAME_PATTERN.test(def.name)) {
    throw new TypeError(
      `definePrompt: invalid name "${def.name}" — must match /^[a-zA-Z0-9_-]{1,64}$/`,
    );
  }

  const isParameterized = hasArguments(def);
  const argumentsJsonSchema = isParameterized
    ? (zodToJsonSchema(def.arguments, { $refStrategy: 'none' }) as Record<string, unknown>)
    : undefined;

  const render = async (rawArgs: unknown, ctx: HandlerContext): Promise<PromptMessage[]> => {
    if (isParameterized) {
      const result = def.arguments.safeParse(rawArgs ?? {});
      if (!result.success) {
        throw new McifyValidationError('arguments', result.error.issues);
      }
      return def.render(result.data, ctx);
    }
    return def.render(ctx);
  };

  return {
    __mcify: 'prompt' as const,
    name: def.name,
    description: def.description,
    arguments: isParameterized ? def.arguments : undefined,
    argumentsJsonSchema,
    render,
  };
}
