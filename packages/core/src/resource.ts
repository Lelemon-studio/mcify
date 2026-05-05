import type { ZodType, z } from 'zod';
import type { HandlerContext } from './context.js';
import { McifyValidationError } from './errors.js';

export interface ResourceContent {
  mimeType: string;
  text?: string;
  blob?: string;
}

export interface StaticResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  read: (ctx: HandlerContext) => ResourceContent | Promise<ResourceContent>;
}

export interface TemplateResourceDefinition<TParams extends ZodType> {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  params: TParams;
  read: (
    params: z.infer<TParams>,
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

export const isResourceTemplate = (uri: string): boolean => URI_TEMPLATE_PATTERN.test(uri);

const hasParams = (
  def: StaticResourceDefinition | TemplateResourceDefinition<ZodType>,
): def is TemplateResourceDefinition<ZodType> => 'params' in def && def.params !== undefined;

export function defineResource(def: StaticResourceDefinition): Resource;
export function defineResource<TParams extends ZodType>(
  def: TemplateResourceDefinition<TParams>,
): Resource;
export function defineResource(
  def: StaticResourceDefinition | TemplateResourceDefinition<ZodType>,
): Resource {
  if (!def.uri) throw new TypeError('defineResource: `uri` is required');
  if (!def.name) throw new TypeError(`defineResource(${def.uri}): \`name\` is required`);

  const isTemplate = isResourceTemplate(def.uri);
  const isParameterized = hasParams(def);

  if (isTemplate && !isParameterized) {
    throw new TypeError(
      `defineResource(${def.uri}): URI has placeholders but no \`params\` schema provided`,
    );
  }
  if (!isTemplate && isParameterized) {
    throw new TypeError(
      `defineResource(${def.uri}): \`params\` was provided but the URI has no placeholders`,
    );
  }

  const read = async (rawParams: unknown, ctx: HandlerContext): Promise<ResourceContent> => {
    if (isParameterized) {
      const result = def.params.safeParse(rawParams ?? {});
      if (!result.success) {
        throw new McifyValidationError('params', result.error.issues);
      }
      return def.read(result.data, ctx);
    }
    return def.read(ctx);
  };

  return {
    __mcify: 'resource' as const,
    uri: def.uri,
    name: def.name,
    description: def.description,
    mimeType: def.mimeType,
    params: isParameterized ? def.params : undefined,
    isTemplate,
    read,
  };
}
