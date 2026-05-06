import { useMemo, useRef, useState } from 'react';
import type { ServerSnapshot } from '../../lib/types';
import { api } from '../../lib/api';
import {
  MODELS,
  modelById,
  providerFor,
  type ChatMessage,
  type ContentBlock,
  type ToolDefinition,
} from '../../lib/llm';

interface ChatTabProps {
  snapshot: ServerSnapshot;
}

const SYSTEM_PROMPT = (serverName: string): string =>
  `You are connected to the "${serverName}" MCP server through the mcify inspector. ` +
  `Use the available tools to satisfy the user's request. ` +
  `When a tool returns data, summarize what happened in plain language.`;

const MAX_TOOL_LOOPS = 5;

export const ChatTab = ({ snapshot }: ChatTabProps) => {
  const [modelId, setModelId] = useState<string>(MODELS[0]?.id ?? '');
  // The API key stays in component state — never persisted, never sent to
  // the inspector server. It's used directly from the browser to call the
  // provider. Page reload wipes it.
  const [apiKey, setApiKey] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const tools: ToolDefinition[] = useMemo(
    () =>
      snapshot.tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    [snapshot.tools],
  );

  const model = modelById(modelId);

  const reset = (): void => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setDraft('');
    setError(null);
    setBusy(false);
  };

  const send = async (): Promise<void> => {
    if (!model) {
      setError('Pick a model.');
      return;
    }
    if (!apiKey) {
      setError(`Paste your ${model.provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key.`);
      return;
    }
    if (!draft.trim()) return;

    setError(null);
    setBusy(true);
    abortRef.current = new AbortController();

    const userMessage: ChatMessage = {
      role: 'user',
      content: [{ type: 'text', text: draft }],
    };

    let workingHistory: ChatMessage[] = [...messages, userMessage];
    setMessages(workingHistory);
    setDraft('');

    const provider = providerFor(model.provider);

    try {
      // Tool-use loop. The provider may emit a tool_use block, which we
      // dispatch to the MCP server's invoke endpoint, append as a tool_result,
      // and call the provider again until it responds with a non-tool turn
      // or we hit the safety cap.
      for (let i = 0; i < MAX_TOOL_LOOPS; i++) {
        const turn = await provider.turn({
          apiKey,
          modelId: model.id,
          systemPrompt: SYSTEM_PROMPT(snapshot.name),
          messages: workingHistory,
          tools,
          signal: abortRef.current.signal,
        });

        workingHistory = [...workingHistory, turn.message];
        setMessages(workingHistory);

        const toolUses = turn.message.content.filter(
          (b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use',
        );
        if (toolUses.length === 0) break;

        // Dispatch every tool_use block in parallel — each is independent.
        const results = await Promise.all(
          toolUses.map(async (use) => {
            try {
              const res = await api.invokeTool(use.name, use.input);
              return res.ok
                ? {
                    type: 'tool_result' as const,
                    toolUseId: use.id,
                    result: res.result,
                  }
                : {
                    type: 'tool_result' as const,
                    toolUseId: use.id,
                    result: res.error,
                    isError: true,
                  };
            } catch (e) {
              return {
                type: 'tool_result' as const,
                toolUseId: use.id,
                result: e instanceof Error ? e.message : 'invocation failed',
                isError: true,
              };
            }
          }),
        );

        const toolResultMessage: ChatMessage = {
          role: 'user',
          content: results,
        };
        workingHistory = [...workingHistory, toolResultMessage];
        setMessages(workingHistory);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        // User pressed Stop. Leave history as-is.
      } else {
        setError(e instanceof Error ? e.message : 'request failed');
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  if (snapshot.tools.length === 0) {
    return (
      <div className="empty">
        Add a tool in <code>mcify.config.ts</code> first — the chat lets the model invoke them.
      </div>
    );
  }

  return (
    <div className="chat">
      <div className="chat__bar">
        <label className="chat__field">
          <span className="muted" style={{ fontSize: 11 }}>
            MODEL
          </span>
          <select value={modelId} onChange={(e) => setModelId(e.target.value)} disabled={busy}>
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="chat__field" style={{ flex: 1 }}>
          <span className="muted" style={{ fontSize: 11 }}>
            API KEY (not stored)
          </span>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={model?.apiKeyPlaceholder ?? ''}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </label>
        <button onClick={reset} disabled={messages.length === 0 && !busy}>
          Clear
        </button>
      </div>

      <div className="chat__transcript">
        {messages.length === 0 ? (
          <div className="empty" style={{ padding: 20 }}>
            Send a message — the model will see {snapshot.tools.length} tool
            {snapshot.tools.length === 1 ? '' : 's'} from <code>{snapshot.name}</code> and can call
            any of them.
          </div>
        ) : (
          messages.map((m, i) => <MessageBlock key={i} message={m} />)
        )}
        {error && <div className="chat__error">{error}</div>}
      </div>

      <div className="chat__input">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Ask the model to use one of the tools…"
          rows={3}
          disabled={busy}
        />
        <div className="chat__send">
          <span className="muted" style={{ fontSize: 11 }}>
            Cmd/Ctrl+Enter to send
          </span>
          {busy ? (
            <button onClick={() => abortRef.current?.abort()}>Stop</button>
          ) : (
            <button onClick={() => void send()} disabled={!draft.trim()}>
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const MessageBlock = ({ message }: { message: ChatMessage }) => {
  const label = message.role === 'user' ? 'You' : 'Assistant';
  // Don't render a "You" header for synthetic tool_result-only user
  // turns — they're noise.
  const onlyToolResults =
    message.role === 'user' && message.content.every((b) => b.type === 'tool_result');

  return (
    <div className={`chat__msg chat__msg--${message.role}`}>
      {!onlyToolResults && <div className="chat__role">{label}</div>}
      {message.content.map((block, i) => (
        <ContentRenderer key={i} block={block} />
      ))}
    </div>
  );
};

const ContentRenderer = ({ block }: { block: ContentBlock }) => {
  if (block.type === 'text') {
    return <div className="chat__text">{block.text}</div>;
  }
  if (block.type === 'tool_use') {
    return (
      <div className="chat__tool">
        <div className="chat__tool-head">
          <span className="tag">tool_use</span>
          <span className="mono">{block.name}</span>
        </div>
        <pre>{JSON.stringify(block.input, null, 2)}</pre>
      </div>
    );
  }
  // tool_result
  return (
    <div className={`chat__tool ${block.isError ? 'chat__tool--error' : ''}`}>
      <div className="chat__tool-head">
        <span className={`tag ${block.isError ? 'tag--error' : 'tag--ok'}`}>
          {block.isError ? 'tool_error' : 'tool_result'}
        </span>
      </div>
      <pre>
        {typeof block.result === 'string' ? block.result : JSON.stringify(block.result, null, 2)}
      </pre>
    </div>
  );
};
