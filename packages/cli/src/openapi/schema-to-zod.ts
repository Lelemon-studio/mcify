import type { Schema } from './types.js';

export interface SchemaToZodOptions {
  /**
   * Refs are not resolved — they're emitted as identifier names so the
   * caller can wire imports / hoist component schemas. The function passed
   * here normalizes a `$ref` like `#/components/schemas/User` into the
   * generated identifier (e.g. `User`).
   */
  resolveRef: (ref: string) => string;
}

const escapeString = (value: string): string => JSON.stringify(value);

/** Convert an OpenAPI Schema to a TypeScript expression that uses Zod. */
export const schemaToZod = (schema: Schema | undefined, opts: SchemaToZodOptions): string => {
  if (!schema) return 'z.unknown()';

  if (schema.$ref) {
    return opts.resolveRef(schema.$ref);
  }

  // Composition operators. `oneOf` and `anyOf` map to z.union; `allOf` maps
  // to z.intersection. Each is left untouched if it has just one element
  // (saves an unnecessary wrapper).
  if (schema.oneOf || schema.anyOf) {
    const variants = (schema.oneOf ?? schema.anyOf ?? []).map((s) => schemaToZod(s, opts));
    const first = variants[0];
    if (variants.length === 0 || !first) return wrapNullable('z.unknown()', schema);
    return wrapNullable(
      variants.length === 1 ? first : `z.union([${variants.join(', ')}])`,
      schema,
    );
  }
  if (schema.allOf) {
    const parts = schema.allOf.map((s) => schemaToZod(s, opts));
    const first = parts[0];
    if (!first) return wrapNullable('z.unknown()', schema);
    if (parts.length === 1) return wrapNullable(first, schema);
    // Zod's intersection is binary; nest folding for >2 parts.
    let acc = first;
    for (let i = 1; i < parts.length; i++) {
      const next = parts[i];
      if (!next) continue;
      acc = `z.intersection(${acc}, ${next})`;
    }
    return wrapNullable(acc, schema);
  }

  // Enum — short-circuits the type switch since Zod has dedicated enum.
  if (schema.enum) {
    return wrapNullable(buildEnum(schema), schema);
  }

  switch (schema.type) {
    case 'string':
      return wrapNullable(buildString(schema), schema);
    case 'integer':
      return wrapNullable(buildInteger(schema), schema);
    case 'number':
      return wrapNullable(buildNumber(schema), schema);
    case 'boolean':
      return wrapNullable('z.boolean()', schema);
    case 'null':
      return 'z.null()';
    case 'array':
      return wrapNullable(buildArray(schema, opts), schema);
    case 'object':
    case undefined:
      // OpenAPI omits `type` for plain objects with `properties`. Treat
      // missing `type` as object when there's structure to read; otherwise
      // emit unknown so we don't lie about the shape.
      if (schema.properties || schema.required || schema.additionalProperties) {
        return wrapNullable(buildObject(schema, opts), schema);
      }
      return wrapNullable('z.unknown()', schema);
    default:
      return `z.unknown() /* TODO: unsupported type ${schema.type} */`;
  }
};

const buildEnum = (schema: Schema): string => {
  const values = schema.enum ?? [];
  if (values.every((v) => typeof v === 'string')) {
    return `z.enum([${values.map((v) => escapeString(v as string)).join(', ')}])`;
  }
  // Mixed-type enums fall back to a literal union.
  const literals = values.map((v) => `z.literal(${JSON.stringify(v)})`).join(', ');
  return values.length === 1 ? literals : `z.union([${literals}])`;
};

const buildString = (schema: Schema): string => {
  let expr = 'z.string()';
  switch (schema.format) {
    case 'email':
      expr += '.email()';
      break;
    case 'uri':
    case 'url':
      expr += '.url()';
      break;
    case 'uuid':
      expr += '.uuid()';
      break;
    case 'date-time':
      expr += '.datetime()';
      break;
    case 'date':
      expr += '.regex(/^\\d{4}-\\d{2}-\\d{2}$/)';
      break;
  }
  if (typeof schema.minLength === 'number') expr += `.min(${schema.minLength})`;
  if (typeof schema.maxLength === 'number') expr += `.max(${schema.maxLength})`;
  if (schema.pattern) expr += `.regex(/${escapeRegex(schema.pattern)}/)`;
  return expr;
};

const buildInteger = (schema: Schema): string => {
  let expr = 'z.number().int()';
  if (typeof schema.minimum === 'number') expr += `.min(${schema.minimum})`;
  if (typeof schema.maximum === 'number') expr += `.max(${schema.maximum})`;
  return expr;
};

const buildNumber = (schema: Schema): string => {
  let expr = 'z.number()';
  if (typeof schema.minimum === 'number') expr += `.min(${schema.minimum})`;
  if (typeof schema.maximum === 'number') expr += `.max(${schema.maximum})`;
  return expr;
};

const buildArray = (schema: Schema, opts: SchemaToZodOptions): string => {
  const inner = schemaToZod(schema.items, opts);
  return `z.array(${inner})`;
};

const buildObject = (schema: Schema, opts: SchemaToZodOptions): string => {
  const required = new Set(schema.required ?? []);
  const props = Object.entries(schema.properties ?? {});

  if (props.length === 0) {
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      return `z.record(${schemaToZod(schema.additionalProperties, opts)})`;
    }
    return 'z.object({})';
  }

  const lines = props.map(([key, child]) => {
    const safeKey = isSafeIdentifier(key) ? key : escapeString(key);
    let value = schemaToZod(child, opts);
    if (!required.has(key)) value += '.optional()';
    if (child && typeof child === 'object' && child.description) {
      value += `.describe(${escapeString(child.description)})`;
    }
    return `  ${safeKey}: ${value},`;
  });

  return `z.object({\n${lines.join('\n')}\n})`;
};

const wrapNullable = (expr: string, schema: Schema): string => {
  if (schema.nullable) return `${expr}.nullable()`;
  return expr;
};

const escapeRegex = (pattern: string): string => pattern.replace(/\//g, '\\/');

const isSafeIdentifier = (key: string): boolean =>
  /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) && !RESERVED.has(key);

const RESERVED = new Set([
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'new',
  'null',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
]);
