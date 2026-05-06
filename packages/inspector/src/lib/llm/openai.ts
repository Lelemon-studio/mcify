import type {
  ChatMessage,
  ChatProvider,
  ChatTurnArgs,
  ChatTurnResult,
  ContentBlock,
} from './types';

const ENDPOINT = 'https://api.openai.com/v1/chat/completions';

interface OpenAiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface OpenAiResponse {
  id: string;
  choices: {
    index: number;
    message: OpenAiMessage;
    finish_reason: string;
  }[];
}

interface OpenAiError {
  error: { message: string; type: string; code?: string };
}

/**
 * Flatten an mcify ChatMessage into the 1..N OpenAI messages it represents.
 * OpenAI doesn't allow tool_use + text in a single assistant message —
 * the assistant turn is one message, and each tool_result becomes its own
 * `role: 'tool'` message keyed by `tool_call_id`.
 */
const toOpenAiMessages = (messages: ChatMessage[], systemPrompt?: string): OpenAiMessage[] => {
  const out: OpenAiMessage[] = [];
  if (systemPrompt) out.push({ role: 'system', content: systemPrompt });

  for (const m of messages) {
    if (m.role === 'assistant') {
      const text = m.content
        .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
        .map((b) => b.text)
        .join('');
      const toolUses = m.content.filter(
        (b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use',
      );
      out.push({
        role: 'assistant',
        content: text || null,
        tool_calls: toolUses.length
          ? toolUses.map((b) => ({
              id: b.id,
              type: 'function' as const,
              function: { name: b.name, arguments: JSON.stringify(b.input) },
            }))
          : undefined,
      });
    } else {
      // user role — could carry text and/or tool_results.
      const text = m.content
        .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
        .map((b) => b.text)
        .join('');
      if (text) out.push({ role: 'user', content: text });
      const results = m.content.filter(
        (b): b is Extract<ContentBlock, { type: 'tool_result' }> => b.type === 'tool_result',
      );
      for (const r of results) {
        out.push({
          role: 'tool',
          tool_call_id: r.toolUseId,
          content: typeof r.result === 'string' ? r.result : JSON.stringify(r.result),
        });
      }
    }
  }
  return out;
};

const fromOpenAiResponse = (msg: OpenAiMessage): ContentBlock[] => {
  const blocks: ContentBlock[] = [];
  if (msg.content && msg.content.length > 0) {
    blocks.push({ type: 'text', text: msg.content });
  }
  for (const call of msg.tool_calls ?? []) {
    let parsed: unknown = {};
    try {
      parsed = JSON.parse(call.function.arguments || '{}');
    } catch {
      // Surface the raw string so the user can see the malformed args.
      parsed = call.function.arguments;
    }
    blocks.push({ type: 'tool_use', id: call.id, name: call.function.name, input: parsed });
  }
  return blocks;
};

export const openAiProvider: ChatProvider = {
  async turn(args: ChatTurnArgs): Promise<ChatTurnResult> {
    const body = {
      model: args.modelId,
      messages: toOpenAiMessages(args.messages, args.systemPrompt),
      tools: args.tools.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      })),
    };

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${args.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: args.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      try {
        const parsed = JSON.parse(text) as OpenAiError;
        throw new Error(`OpenAI ${res.status}: ${parsed.error?.message ?? text}`);
      } catch {
        throw new Error(`OpenAI ${res.status}: ${text}`);
      }
    }

    const data = (await res.json()) as OpenAiResponse;
    const choice = data.choices[0];
    if (!choice) throw new Error('OpenAI returned no choices');

    return {
      message: { role: 'assistant', content: fromOpenAiResponse(choice.message) },
      stopReason: choice.finish_reason,
    };
  },
};
