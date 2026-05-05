import type { ZodType, z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { HandlerContext } from './context.js';
import { McifyValidationError } from './errors.js';

export interface ToolDefinition<TInput extends ZodType, TOutput extends ZodType> {
  name: string;
  description: string;
  input: TInput;
  output: TOutput;
  handler: (
    input: z.infer<TInput>,
    ctx: HandlerContext,
  ) => z.infer<TOutput> | Promise<z.infer<TOutput>>;
}

export interface Tool<TInput extends ZodType = ZodType, TOutput extends ZodType = ZodType> {
  readonly __mcify: 'tool';
  readonly name: string;
  readonly description: string;
  readonly input: TInput;
  readonly output: TOutput;
  readonly inputJsonSchema: Record<string, unknown>;
  readonly outputJsonSchema: Record<string, unknown>;
  readonly handler: (input: z.infer<TInput>, ctx: HandlerContext) => Promise<z.infer<TOutput>>;
  readonly invoke: (rawInput: unknown, ctx: HandlerContext) => Promise<z.infer<TOutput>>;
}

const TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

export function defineTool<TInput extends ZodType, TOutput extends ZodType>(
  def: ToolDefinition<TInput, TOutput>,
): Tool<TInput, TOutput> {
  if (!def.name || typeof def.name !== 'string') {
    throw new TypeError('defineTool: `name` is required and must be a non-empty string');
  }
  if (!TOOL_NAME_PATTERN.test(def.name)) {
    throw new TypeError(
      `defineTool: invalid name "${def.name}" — must match /^[a-zA-Z0-9_-]{1,64}$/`,
    );
  }
  if (!def.description || typeof def.description !== 'string') {
    throw new TypeError(`defineTool(${def.name}): \`description\` is required`);
  }

  const handler = async (input: z.infer<TInput>, ctx: HandlerContext): Promise<z.infer<TOutput>> =>
    Promise.resolve(def.handler(input, ctx));

  const invoke = async (rawInput: unknown, ctx: HandlerContext): Promise<z.infer<TOutput>> => {
    const inputResult = def.input.safeParse(rawInput);
    if (!inputResult.success) {
      throw new McifyValidationError('input', inputResult.error.issues);
    }
    const result = await handler(inputResult.data as z.infer<TInput>, ctx);
    const outputResult = def.output.safeParse(result);
    if (!outputResult.success) {
      throw new McifyValidationError('output', outputResult.error.issues);
    }
    return outputResult.data as z.infer<TOutput>;
  };

  return {
    __mcify: 'tool' as const,
    name: def.name,
    description: def.description,
    input: def.input,
    output: def.output,
    inputJsonSchema: zodToJsonSchema(def.input, { $refStrategy: 'none' }) as Record<string, unknown>,
    outputJsonSchema: zodToJsonSchema(def.output, { $refStrategy: 'none' }) as Record<
      string,
      unknown
    >,
    handler,
    invoke,
  };
}
