/**
 * OpenAPI 3.0 / 3.1 — minimal type surface that covers what the generator
 * actually reads. Intentionally narrower than the full spec: we don't need
 * to model `xml`, `discriminator`, `externalDocs`, etc.
 */

export interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string; description?: string };
  servers?: { url: string; description?: string }[];
  paths?: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, Schema>;
    securitySchemes?: Record<string, SecurityScheme>;
  };
  security?: SecurityRequirement[];
}

export type SecurityRequirement = Record<string, string[]>;

export type Method = 'get' | 'put' | 'post' | 'delete' | 'patch';

export interface PathItem {
  parameters?: Parameter[];
  get?: Operation;
  put?: Operation;
  post?: Operation;
  delete?: Operation;
  patch?: Operation;
}

export interface Operation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses?: Record<string, Response>;
  security?: SecurityRequirement[];
  deprecated?: boolean;
}

export interface Parameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  description?: string;
  required?: boolean;
  schema?: Schema;
  deprecated?: boolean;
}

export interface RequestBody {
  description?: string;
  required?: boolean;
  content?: Record<string, MediaType>;
}

export interface Response {
  description: string;
  content?: Record<string, MediaType>;
}

export interface MediaType {
  schema?: Schema;
}

/**
 * Minimal OpenAPI Schema. Covers what we generate Zod for; anything we
 * don't model surfaces as `z.unknown()` with a TODO comment.
 */
export interface Schema {
  $ref?: string;
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null';
  // OpenAPI 3.1 supports `type` as an array (`["string", "null"]`); we map
  // that into `.nullable()`.
  format?: string;
  description?: string;
  enum?: unknown[];
  default?: unknown;
  nullable?: boolean;
  required?: string[];
  properties?: Record<string, Schema>;
  additionalProperties?: boolean | Schema;
  items?: Schema;
  oneOf?: Schema[];
  anyOf?: Schema[];
  allOf?: Schema[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
}

export type SecurityScheme =
  | { type: 'apiKey'; in: 'header' | 'query' | 'cookie'; name: string; description?: string }
  | { type: 'http'; scheme: 'bearer' | 'basic'; bearerFormat?: string; description?: string }
  | { type: 'oauth2'; flows: Record<string, unknown>; description?: string }
  | { type: 'openIdConnect'; openIdConnectUrl: string; description?: string };
