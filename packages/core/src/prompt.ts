import type { ZodType, z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { HandlerContext } from './context.js';
import { McifyValidationError } from './errors.js';

export type PromptRole = 'user' | 'assistant' | 'system';

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

export interface PromptDefinition<TArgs extends ZodType | undefined = undefined> {
  name: string;
  description?: string;
  arguments?: TArgs;
  render: (
    args: TArgs extends ZodType ? z.infer<TArgs> : Record<string, never>,
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

export function definePrompt<TArgs extends ZodType | undefined = undefined>(
  def: PromptDefinition<TArgs>,
): Prompt {
  if (!def.name) throw new TypeError('definePrompt: `name` is required');
  if (!PROMPT_NAME_PATTERN.test(def.name)) {
    throw new TypeError(
      `definePrompt: invalid name "${def.name}" — must match /^[a-zA-Z0-9_-]{1,64}$/`,
    );
  }

  const argumentsJsonSchema = def.arguments
    ? (zodToJsonSchema(def.arguments, { $refStrategy: 'none' }) as Record<string, unknown>)
    : undefined;

  const render = async (rawArgs: unknown, ctx: HandlerContext): Promise<PromptMessage[]> => {
    const argsInput = rawArgs ?? {};
    let args: unknown = argsInput;
    if (def.arguments) {
      const result = def.arguments.safeParse(argsInput);
      if (!result.success) {
        throw new McifyValidationError('arguments', result.error.issues);
      }
      args = result.data;
    }
    return Promise.resolve(
      (def.render as (a: unknown, c: HandlerContext) => PromptMessage[] | Promise<PromptMessage[]>)(
        args,
        ctx,
      ),
    );
  };

  return {
    __mcify: 'prompt' as const,
    name: def.name,
    description: def.description,
    arguments: def.arguments,
    argumentsJsonSchema,
    render,
  };
}
