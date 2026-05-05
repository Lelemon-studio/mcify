import { bearer } from './auth/bearer.js';
import { apiKey } from './auth/api-key.js';
import { oauth } from './auth/oauth.js';
import { none } from './auth/none.js';

export const version = '0.0.1-alpha.0';

// Tool
export { defineTool } from './tool.js';
export type { Tool, ToolDefinition } from './tool.js';

// Resource
export { defineResource, isResourceTemplate } from './resource.js';
export type {
  Resource,
  StaticResourceDefinition,
  TemplateResourceDefinition,
  ResourceContent,
} from './resource.js';

// Prompt
export { definePrompt } from './prompt.js';
export type {
  Prompt,
  BasicPromptDefinition,
  ParameterizedPromptDefinition,
  PromptMessage,
  PromptContent,
  PromptTextContent,
  PromptImageContent,
  PromptRole,
} from './prompt.js';

// Config
export { defineConfig } from './config.js';
export type { Config } from './config.js';

// Auth — `bearer`, `apiKey`, `oauth` are exported as top-level for convenience.
// `none` is intentionally only available via the `auth` namespace below to avoid
// shadowing the common `none` identifier in user code.
export { bearer, apiKey, oauth };
export type { BearerOptions } from './auth/bearer.js';
export type { ApiKeyOptions } from './auth/api-key.js';
export type { OAuthOptions } from './auth/oauth.js';
export type { AuthConfig } from './auth/types.js';

export const auth = { bearer, apiKey, oauth, none } as const;

// Context
export type { HandlerContext, Logger, LogMeta, AuthState, RequestMeta } from './context.js';

// Errors
export { McifyValidationError } from './errors.js';
export type { ValidationPhase } from './errors.js';

// Schema helpers
export { schema } from './schema/index.js';

// Middleware (also available standalone via `@mcify/core/middleware`)
export { composeMiddlewares, requireAuth, rateLimit, withTimeout } from './middleware.js';
export type {
  ToolMiddleware,
  RequireAuthOptions,
  RateLimitOptions,
  WithTimeoutOptions,
} from './middleware.js';
