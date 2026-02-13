export * from '../core/types.js';

export interface ChatChunk {
  content?: string;
  toolCalls?: Partial<import('../core/types.js').ToolCall>;
  done?: boolean;
}

export interface RateLimitConfig {
  maxPerMinute: number;
  maxPerHour?: number;
}

export interface LLMProviderConfig {
  model: string;
  baseUrl?: string;
  apiKey?: string;
  rateLimit?: RateLimitConfig;
}
