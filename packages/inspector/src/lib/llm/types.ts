/**
 * Provider-agnostic chat message + tool call shape that both the Anthropic
 * and the OpenAI clients map to. The Chat tab UI only ever speaks these
 * types — provider-specific request/response shapes are translated inside
 * each `lib/llm/<provider>.ts` module.
 */

export type Role = 'user' | 'assistant';

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  /** Provider-issued id we must echo back when replying with tool_result. */
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultBlock {
  type: 'tool_result';
  /** Matches the tool_use id. */
  toolUseId: string;
  /** JSON-serializable result returned by the MCP server, or an error string. */
  result: unknown;
  isError?: boolean;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface ChatMessage {
  role: Role;
  content: ContentBlock[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema 7. We pass the snapshot's inputSchema verbatim. */
  inputSchema: Record<string, unknown>;
}

export interface ChatTurnArgs {
  apiKey: string;
  modelId: string;
  systemPrompt?: string;
  messages: ChatMessage[];
  tools: ToolDefinition[];
  signal?: AbortSignal;
}

export interface ChatTurnResult {
  /** New assistant message produced by the provider. */
  message: ChatMessage;
  /** `end_turn` / `stop` / `tool_use` etc. — surfaced for UX. */
  stopReason: string;
}

export interface ChatProvider {
  /** Run a single completion and return the assistant message + stop reason. */
  turn(args: ChatTurnArgs): Promise<ChatTurnResult>;
}
