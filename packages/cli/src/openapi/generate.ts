import { promises as fs } from 'node:fs';
import path from 'node:path';
import { schemaToZod } from './schema-to-zod.js';
import type {
  Method,
  OpenApiDocument,
  Operation,
  Parameter,
  PathItem,
  SecurityScheme,
} from './types.js';

const HTTP_METHODS: Method[] = ['get', 'put', 'post', 'delete', 'patch'];

export interface GenerateOptions {
  /** Spec source — URL or filesystem path. */
  source: string;
  /** Output directory for the generated file (relative to cwd). */
  outDir: string;
  /**
   * Service prefix. Becomes part of the generated tool names (`<prefix>_<op>`)
   * and the output filename (`<prefix>.ts`). Required when more than one spec
   * lands in the same project so identifiers don't collide.
   */
  prefix: string;
  /**
   * Pre-loaded document. When omitted, the loader fetches/reads `source`.
   */
  document: OpenApiDocument;
}

export interface GenerateResult {
  outFile: string;
  toolCount: number;
  serverUrl: string;
  prefix: string;
}

interface OperationContext {
  method: Method;
  pathPattern: string;
  operation: Operation;
  /** path-level parameters (apply to every method on this path). */
  pathParameters: Parameter[];
}

export const generateFromOpenApi = async (options: GenerateOptions): Promise<GenerateResult> => {
  const doc = options.document;
  const operations = collectOperations(doc);

  const componentSchemas = doc.components?.schemas ?? {};
  const componentNames = new Set(Object.keys(componentSchemas));

  // Component schemas land as top-level Zod consts so each tool can refer
  // to them without inline duplication. The names mirror the source — we
  // keep them stable for diffability.
  const componentDecls = Object.entries(componentSchemas).map(([name, schema]) => {
    const expr = schemaToZod(schema, {
      resolveRef: (ref) => refToIdent(ref, componentNames),
    });
    return `export const ${name} = ${expr};`;
  });

  const tools = operations.map((op) => buildToolSnippet(op, options.prefix, componentNames));

  const security = doc.components?.securitySchemes ?? {};
  const authConfig = pickAuthForClient(security, doc);

  const serverUrl = doc.servers?.[0]?.url ?? '';
  const fileName = `${options.prefix}.ts`;
  const outPath = path.resolve(process.cwd(), options.outDir, fileName);
  await fs.mkdir(path.dirname(outPath), { recursive: true });

  const fileContent = renderFile({
    serviceTitle: doc.info.title,
    serviceVersion: doc.info.version,
    sourceLabel: options.source,
    prefix: options.prefix,
    serverUrl,
    componentDecls,
    tools,
    authConfig,
  });

  await fs.writeFile(outPath, fileContent, 'utf-8');

  return {
    outFile: outPath,
    toolCount: operations.length,
    serverUrl,
    prefix: options.prefix,
  };
};

const collectOperations = (doc: OpenApiDocument): OperationContext[] => {
  const out: OperationContext[] = [];
  for (const [pathPattern, item] of Object.entries(doc.paths ?? {})) {
    if (!item) continue;
    for (const method of HTTP_METHODS) {
      const op = (item as PathItem)[method];
      if (!op || op.deprecated) continue;
      out.push({
        method,
        pathPattern,
        operation: op,
        pathParameters: item.parameters ?? [],
      });
    }
  }
  return out;
};

interface ToolSnippet {
  decl: string;
  exportName: string;
  factoryName: string;
}

const buildToolSnippet = (
  ctx: OperationContext,
  prefix: string,
  componentNames: Set<string>,
): ToolSnippet => {
  const opName = ctx.operation.operationId ?? defaultOpName(ctx);
  const toolName = `${prefix}_${snakeCase(opName)}`;
  const factoryName = `create_${toolName}_tool`;
  const exportName = camelCase(`create_${toolName}_tool`);

  const allParameters = mergeParameters(ctx.pathParameters, ctx.operation.parameters ?? []);
  const inputSchema = buildInputSchema(allParameters, ctx.operation, componentNames);
  const outputSchema = buildOutputSchema(ctx.operation, componentNames);
  const description = buildDescription(ctx.operation);

  const handler = buildHandler(ctx, allParameters);

  const decl = [
    `export const ${exportName} = (client: GeneratedClient) =>`,
    `  defineTool({`,
    `    name: ${JSON.stringify(toolName)},`,
    `    description: ${JSON.stringify(description)},`,
    `    input: ${indent(inputSchema, 4)},`,
    `    output: ${indent(outputSchema, 4)},`,
    `    handler: ${handler},`,
    `  });`,
  ].join('\n');

  return { decl, exportName, factoryName };
};

const buildDescription = (op: Operation): string => {
  const summary = op.summary?.trim();
  const description = op.description?.trim();
  if (summary && description) return `${summary}. ${description}`;
  return summary ?? description ?? 'Generated from OpenAPI spec';
};

const buildInputSchema = (
  parameters: Parameter[],
  op: Operation,
  componentNames: Set<string>,
): string => {
  const lines: string[] = [];
  const opts = { resolveRef: (ref: string) => refToIdent(ref, componentNames) };

  for (const param of parameters) {
    const expr = schemaToZod(param.schema, opts);
    const annotated = annotateParam(expr, param);
    const safeKey = JSON.stringify(param.name);
    lines.push(`  ${safeKey}: ${annotated},`);
  }

  // Include the JSON request body as a `body` field. For non-JSON bodies we
  // surface a TODO so the generated handler can be hand-tuned.
  const jsonBody = op.requestBody?.content?.['application/json']?.schema;
  if (jsonBody) {
    let bodyExpr = schemaToZod(jsonBody, opts);
    if (op.requestBody && op.requestBody.required === false) bodyExpr += '.optional()';
    lines.push(`  body: ${indent(bodyExpr, 2)},`);
  }

  if (lines.length === 0) return 'z.object({})';
  return `z.object({\n${lines.join('\n')}\n  })`;
};

const annotateParam = (expr: string, param: Parameter): string => {
  let out = expr;
  if (param.required !== true) out += '.optional()';
  if (param.description) out += `.describe(${JSON.stringify(param.description)})`;
  return out;
};

const buildOutputSchema = (op: Operation, componentNames: Set<string>): string => {
  // Pick the first 2xx response with a JSON schema. If none, fall back to
  // z.unknown() so the tool still validates structurally.
  const responses = op.responses ?? {};
  const successKey = Object.keys(responses).find((k) => /^2\d\d$/.test(k));
  if (!successKey) return 'z.unknown()';
  const schema = responses[successKey]?.content?.['application/json']?.schema;
  if (!schema) return 'z.unknown()';
  return schemaToZod(schema, { resolveRef: (ref) => refToIdent(ref, componentNames) });
};

const buildHandler = (ctx: OperationContext, params: Parameter[]): string => {
  const pathParams = params.filter((p) => p.in === 'path');
  const queryParams = params.filter((p) => p.in === 'query');
  const headerParams = params.filter((p) => p.in === 'header');

  // Build URL substitution: replace `{id}` with `${input.id}` keeping the
  // template path readable. Path params are always required by spec, so we
  // don't guard against undefined here.
  let pathExpr = JSON.stringify(ctx.pathPattern);
  for (const p of pathParams) {
    const placeholder = `{${p.name}}`;
    pathExpr = pathExpr.replace(
      JSON.stringify(placeholder),
      `\` + encodeURIComponent(String(input[${JSON.stringify(p.name)}])) + \``,
    );
    // Also replace inline form (when JSON-stringify quotes the whole path).
    pathExpr = pathExpr.replace(
      placeholder,
      `\${encodeURIComponent(String(input[${JSON.stringify(p.name)}]))}`,
    );
  }
  // Wrap in a template literal so substitutions render as expected.
  pathExpr =
    '`' +
    ctx.pathPattern.replace(
      /{(\w+)}/g,
      (_m, name: string) => `\${encodeURIComponent(String(input[${JSON.stringify(name)}]))}`,
    ) +
    '`';

  const querySetters = queryParams
    .map(
      (p) =>
        `      if (input[${JSON.stringify(p.name)}] !== undefined) ` +
        `query.set(${JSON.stringify(p.name)}, String(input[${JSON.stringify(p.name)}]));`,
    )
    .join('\n');

  const headerSetters = headerParams
    .map(
      (p) =>
        `      if (input[${JSON.stringify(p.name)}] !== undefined) ` +
        `headers[${JSON.stringify(p.name)}] = String(input[${JSON.stringify(p.name)}]);`,
    )
    .join('\n');

  const hasBody = Boolean(ctx.operation.requestBody?.content?.['application/json']);
  const bodyLine = hasBody
    ? `      const body = input.body !== undefined ? JSON.stringify(input.body) : undefined;`
    : `      const body: string | undefined = undefined;`;

  return [
    `async (input: Record<string, unknown>) => {`,
    `      const query = new URLSearchParams();`,
    querySetters || `      // (no query parameters)`,
    `      const headers: Record<string, string> = { accept: 'application/json' };`,
    headerSetters || `      // (no header parameters)`,
    `      ${hasBody ? `if (body !== undefined) headers['content-type'] = 'application/json';` : ''}`,
    bodyLine,
    `      const url = ` + pathExpr + ` + (query.size ? '?' + query.toString() : '');`,
    `      return client.request({ method: ${JSON.stringify(ctx.method.toUpperCase())}, url, headers, body });`,
    `    }`,
  ]
    .filter(Boolean)
    .join('\n');
};

const mergeParameters = (a: Parameter[], b: Parameter[]): Parameter[] => {
  // Operation-level parameters override path-level ones with the same
  // (name, in) pair. OpenAPI 3.0 spec, §4.7.6.
  const map = new Map<string, Parameter>();
  for (const p of a) map.set(`${p.in}:${p.name}`, p);
  for (const p of b) map.set(`${p.in}:${p.name}`, p);
  return [...map.values()];
};

const pickAuthForClient = (
  schemes: Record<string, SecurityScheme>,
  doc: OpenApiDocument,
): string => {
  // We pick the first declared scheme to seed the client header. The user
  // can edit the generated file to swap or add more.
  const required = doc.security ?? [];
  const requiredNames = required.flatMap((req) => Object.keys(req));
  const candidate = requiredNames[0] ?? Object.keys(schemes)[0];
  if (!candidate) {
    return `// No security scheme detected — calls go out unauthenticated.\n  // Add Authorization (or other) headers in createGeneratedClient if needed.`;
  }
  const scheme = schemes[candidate];
  if (!scheme) return '';

  // The generated client merges per-request headers into `merged` before
  // sending — mutate `merged`, not the caller's `headers`. The `if`
  // guard lets the user create a token-less client for unauthenticated
  // sandboxes without runtime errors.
  if (scheme.type === 'http' && scheme.scheme === 'bearer') {
    return `if (opts.token !== undefined) merged['authorization'] = \`Bearer \${opts.token}\`;`;
  }
  if (scheme.type === 'http' && scheme.scheme === 'basic') {
    return `if (opts.token !== undefined) merged['authorization'] = \`Basic \${opts.token}\`;`;
  }
  if (scheme.type === 'apiKey' && scheme.in === 'header') {
    return `if (opts.token !== undefined) merged[${JSON.stringify(scheme.name.toLowerCase())}] = opts.token;`;
  }
  if (scheme.type === 'apiKey' && scheme.in === 'query') {
    // Query-key auth requires URL mutation per request; surface a TODO so
    // the developer wires it up explicitly.
    return `// TODO: query-style API key auth — append \`${scheme.name}=\${opts.token}\` to each URL.`;
  }
  return `// Unsupported security scheme "${candidate}" (${scheme.type}). Wire auth manually.`;
};

interface RenderArgs {
  serviceTitle: string;
  serviceVersion: string;
  sourceLabel: string;
  prefix: string;
  serverUrl: string;
  componentDecls: string[];
  tools: ToolSnippet[];
  authConfig: string;
}

const renderFile = (args: RenderArgs): string => {
  const header = [
    `// Generated by \`mcify generate from-openapi\`. Do not edit by hand.`,
    `// Source: ${args.sourceLabel}`,
    `// Service: ${args.serviceTitle} v${args.serviceVersion}`,
    `// Prefix:  ${args.prefix}`,
    ``,
    `import { defineTool } from '@mcify/core';`,
    `import { z } from 'zod';`,
    ``,
  ].join('\n');

  const clientBlock = [
    `export interface GeneratedClientOptions {`,
    `  /** Auth token (bearer, api key, etc — depending on the spec). */`,
    `  token?: string;`,
    `  /** Override the base URL embedded from the spec's first \`servers[]\` entry. */`,
    `  baseUrl?: string;`,
    `  /** Inject a fetch implementation. Defaults to \`globalThis.fetch\`. */`,
    `  fetch?: typeof globalThis.fetch;`,
    `}`,
    ``,
    `export interface GeneratedClient {`,
    `  request(req: {`,
    `    method: string;`,
    `    url: string;`,
    `    headers: Record<string, string>;`,
    `    body?: string;`,
    `  }): Promise<unknown>;`,
    `}`,
    ``,
    `export const create_${args.prefix}_client = (opts: GeneratedClientOptions = {}): GeneratedClient => {`,
    `  const baseUrl = (opts.baseUrl ?? ${JSON.stringify(args.serverUrl)}).replace(/\\/$/, '');`,
    `  const fetchImpl = opts.fetch ?? globalThis.fetch;`,
    `  return {`,
    `    async request({ method, url, headers, body }) {`,
    `      const merged: Record<string, string> = { ...headers };`,
    `      ${args.authConfig}`,
    `      const res = await fetchImpl(baseUrl + url, { method, headers: merged, body });`,
    `      const text = await res.text();`,
    `      let parsed: unknown = text;`,
    `      if (text.length > 0) {`,
    `        try { parsed = JSON.parse(text); } catch { parsed = text; }`,
    `      }`,
    `      if (!res.ok) {`,
    `        throw new Error(\`\${method} \${url} → \${res.status}: \${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}\`);`,
    `      }`,
    `      return parsed;`,
    `    },`,
    `  };`,
    `};`,
    ``,
  ].join('\n');

  const componentsBlock = args.componentDecls.length
    ? `// Component schemas\n\n${args.componentDecls.join('\n\n')}\n\n`
    : '';

  const toolsBlock = args.tools.map((t) => t.decl).join('\n\n');

  const factoryBlock = [
    ``,
    `/** Build an array of all tools wired against \`client\`. Mix into your`,
    ` *  \`mcify.config.ts\` tools[] alongside other connectors. */`,
    `export const ${args.prefix}_tools = (client: GeneratedClient) => [`,
    ...args.tools.map((t) => `  ${t.exportName}(client),`),
    `];`,
    ``,
  ].join('\n');

  return header + clientBlock + componentsBlock + toolsBlock + '\n' + factoryBlock;
};

// --- helpers --------------------------------------------------------------

const refToIdent = (ref: string, componentNames: Set<string>): string => {
  const match = /^#\/components\/schemas\/(.+)$/.exec(ref);
  if (!match || !match[1]) return 'z.unknown()';
  const ident = match[1];
  return componentNames.has(ident) ? ident : 'z.unknown()';
};

const defaultOpName = (ctx: OperationContext): string => {
  // Build a fallback id from method + path when the spec doesn't supply
  // operationId. e.g. GET /users/{id}/posts → get_users_id_posts.
  const segments = ctx.pathPattern
    .split('/')
    .filter(Boolean)
    .map((s) => s.replace(/[{}]/g, ''))
    .join('_');
  return `${ctx.method}_${segments || 'root'}`;
};

const snakeCase = (input: string): string =>
  input
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s\-./]+/g, '_')
    .replace(/[^A-Za-z0-9_]/g, '')
    .toLowerCase();

const camelCase = (input: string): string =>
  snakeCase(input)
    .split('_')
    .map((part, i) => (i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('');

const indent = (block: string, spaces: number): string =>
  block
    .split('\n')
    .map((line, i) => (i === 0 ? line : ' '.repeat(spaces) + line))
    .join('\n');
