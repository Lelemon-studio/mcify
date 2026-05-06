import { anthropicProvider } from './anthropic';
import { openAiProvider } from './openai';
import type { ChatProvider } from './types';

export type ProviderId = 'anthropic' | 'openai';

export interface ModelDescriptor {
  /** Provider-native model id sent to the API. */
  id: string;
  /** Human label shown in the dropdown. */
  label: string;
  provider: ProviderId;
  /** Hint shown next to the API key field. */
  apiKeyPlaceholder: string;
}

/**
 * Curated list. Anything missing here can still be reached by typing the
 * model id in the field — but the dropdown stays focused on the canonical
 * options so the user doesn't need to memorize ids.
 */
export const MODELS: ModelDescriptor[] = [
  {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    apiKeyPlaceholder: 'sk-ant-...',
  },
  {
    id: 'claude-opus-4-7',
    label: 'Claude Opus 4.7',
    provider: 'anthropic',
    apiKeyPlaceholder: 'sk-ant-...',
  },
  {
    id: 'claude-haiku-4-5-20251001',
    label: 'Claude Haiku 4.5',
    provider: 'anthropic',
    apiKeyPlaceholder: 'sk-ant-...',
  },
  {
    id: 'gpt-4o',
    label: 'GPT-4o',
    provider: 'openai',
    apiKeyPlaceholder: 'sk-...',
  },
  {
    id: 'gpt-4o-mini',
    label: 'GPT-4o mini',
    provider: 'openai',
    apiKeyPlaceholder: 'sk-...',
  },
];

const PROVIDERS: Record<ProviderId, ChatProvider> = {
  anthropic: anthropicProvider,
  openai: openAiProvider,
};

export const providerFor = (id: ProviderId): ChatProvider => PROVIDERS[id];

export const modelById = (id: string): ModelDescriptor | undefined =>
  MODELS.find((m) => m.id === id);

export type {
  ChatMessage,
  ChatProvider,
  ChatTurnArgs,
  ChatTurnResult,
  ContentBlock,
  TextBlock,
  ToolDefinition,
  ToolResultBlock,
  ToolUseBlock,
} from './types';
