import type {
  ChatMessage,
  ChatProvider,
  ChatTurnArgs,
  ChatTurnResult,
  ContentBlock,
} from './types';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}
interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}
interface AnthropicToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}
type AnthropicContent = AnthropicTextBlock | AnthropicToolUseBlock | AnthropicToolResultBlock;

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: AnthropicContent[];
}

interface AnthropicResponse {
  id: string;
  role: 'assistant';
  content: AnthropicContent[];
  stop_reason: string | null;
}

interface AnthropicError {
  type: 'error';
  error: { type: string; message: string };
}

const toAnthropicMessages = (messages: ChatMessage[]): AnthropicMessage[] =>
  messages.map((m) => ({
    role: m.role,
    content: m.content.map((b): AnthropicContent => {
      if (b.type === 'text') return { type: 'text', text: b.text };
      if (b.type === 'tool_use')
        return { type: 'tool_use', id: b.id, name: b.name, input: b.input };
      return {
        type: 'tool_result',
        tool_use_id: b.toolUseId,
        content: typeof b.result === 'string' ? b.result : JSON.stringify(b.result),
        is_error: b.isError,
      };
    }),
  }));

const fromAnthropicContent = (content: AnthropicContent[]): ContentBlock[] =>
  content.map((b): ContentBlock => {
    if (b.type === 'text') return { type: 'text', text: b.text };
    if (b.type === 'tool_use') return { type: 'tool_use', id: b.id, name: b.name, input: b.input };
    // The provider doesn't echo tool_result blocks in assistant turns, but
    // map defensively in case it ever does.
    return {
      type: 'tool_result',
      toolUseId: b.tool_use_id,
      result: b.content,
      isError: b.is_error,
    };
  });

export const anthropicProvider: ChatProvider = {
  async turn(args: ChatTurnArgs): Promise<ChatTurnResult> {
    const body = {
      model: args.modelId,
      max_tokens: 4096,
      system: args.systemPrompt,
      messages: toAnthropicMessages(args.messages),
      tools: args.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      })),
    };

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': args.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        // Required for browser-side calls. The user is invoking this from
        // the inspector with their own key, fully aware of CORS exposure.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
      signal: args.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      try {
        const parsed = JSON.parse(text) as AnthropicError;
        throw new Error(`Anthropic ${res.status}: ${parsed.error?.message ?? text}`);
      } catch {
        throw new Error(`Anthropic ${res.status}: ${text}`);
      }
    }

    const data = (await res.json()) as AnthropicResponse;
    return {
      message: { role: 'assistant', content: fromAnthropicContent(data.content) },
      stopReason: data.stop_reason ?? 'unknown',
    };
  },
};
