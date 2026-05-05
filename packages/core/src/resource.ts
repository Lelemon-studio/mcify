import type { ZodType, z } from 'zod';
import type { HandlerContext } from './context.js';
import { McifyValidationError } from './errors.js';

export interface ResourceContent {
  mimeType: string;
  text?: string;
  blob?: string;
}

export interface ResourceDefinition<TParams extends ZodType | undefined = undefined> {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  params?: TParams;
  read: (
    params: TParams extends ZodType ? z.infer<TParams> : Record<string, never>,
    ctx: HandlerContext,
  ) => ResourceContent | Promise<ResourceContent>;
}

export interface Resource {
  readonly __mcify: 'resource';
  readonly uri: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly mimeType?: string | undefined;
  readonly params?: ZodType | undefined;
  readonly isTemplate: boolean;
  readonly read: (rawParams: unknown, ctx: HandlerContext) => Promise<ResourceContent>;
}

const URI_TEMPLATE_PATTERN = /\{[^/{}]+\}/;

export function isResourceTemplate(uri: string): boolean {
  return URI_TEMPLATE_PATTERN.test(uri);
}

export function defineResource<TParams extends ZodType | undefined = undefined>(
  def: ResourceDefinition<TParams>,
): Resource {
  if (!def.uri) throw new TypeError('defineResource: `uri` is required');
  if (!def.name) throw new TypeError(`defineResource(${def.uri}): \`name\` is required`);

  const isTemplate = isResourceTemplate(def.uri);

  if (isTemplate && !def.params) {
    throw new TypeError(
      `defineResource(${def.uri}): URI has placeholders but no \`params\` schema provided`,
    );
  }

  const read = async (rawParams: unknown, ctx: HandlerContext): Promise<ResourceContent> => {
    const paramsInput = rawParams ?? {};
    let params: unknown = paramsInput;
    if (def.params) {
      const result = def.params.safeParse(paramsInput);
      if (!result.success) {
        throw new McifyValidationError('params', result.error.issues);
      }
      params = result.data;
    }
    const content = await Promise.resolve(
      (def.read as (p: unknown, c: HandlerContext) => ResourceContent | Promise<ResourceContent>)(
        params,
        ctx,
      ),
    );
    return content;
  };

  return {
    __mcify: 'resource' as const,
    uri: def.uri,
    name: def.name,
    description: def.description,
    mimeType: def.mimeType,
    params: def.params,
    isTemplate,
    read,
  };
}
