export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ChatOptions {
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
}

export interface ChatResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage?: TokenUsage;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens?: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  
  stream?(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<ChatChunk>;
  
  countTokens?(text: string): number;
  
  readonly supportsTools?: boolean;
}

export interface ChatChunk {
  content?: string;
  toolCalls?: Partial<ToolCall>;
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
