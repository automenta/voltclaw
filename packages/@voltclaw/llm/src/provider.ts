import type {
  LLMProvider,
  ChatMessage,
  ChatResponse,
  ChatOptions,
  ToolDefinition,
  ToolCall,
  TokenUsage,
  LLMProviderConfig,
  RateLimitConfig,
  ChatChunk
} from './types.js';

export type {
  LLMProvider,
  ChatMessage,
  ChatResponse,
  ChatOptions,
  ToolDefinition,
  ToolCall,
  TokenUsage,
  LLMProviderConfig,
  RateLimitConfig,
  ChatChunk
};

export abstract class BaseLLMProvider implements LLMProvider {
  abstract readonly name: string;
  abstract readonly model: string;
  abstract readonly supportsTools?: boolean;
  
  abstract chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  
  protected rateLimiter: RateLimiter | null = null;
  
  constructor(config?: { rateLimit?: RateLimitConfig }) {
    if (config?.rateLimit) {
      this.rateLimiter = new RateLimiter(config.rateLimit);
    }
  }
  
  protected async checkRateLimit(): Promise<void> {
    if (this.rateLimiter) {
      await this.rateLimiter.acquire();
    }
  }
  
  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

class RateLimiter {
  private timestamps: number[] = [];
  
  constructor(private config: RateLimitConfig) {}
  
  async acquire(): Promise<void> {
    const now = Date.now();
    const minuteAgo = now - 60000;
    
    this.timestamps = this.timestamps.filter(ts => ts > minuteAgo);
    
    if (this.timestamps.length >= this.config.maxPerMinute) {
      const oldestInWindow = this.timestamps[0];
      if (oldestInWindow !== undefined) {
        const waitTime = oldestInWindow + 60000 - now;
        
        if (waitTime > 0) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        this.timestamps = this.timestamps.filter(ts => ts > Date.now() - 60000);
      }
    }
    
    this.timestamps.push(Date.now());
  }
}

export async function createLLMProvider(
  config: { provider: string } & LLMProviderConfig
): Promise<LLMProvider> {
  const { provider, ...rest } = config;
  
  switch (provider) {
    case 'ollama': {
      const { OllamaProvider } = await import('./ollama.js');
      return new OllamaProvider(rest);
    }
    case 'openai': {
      const { OpenAIProvider } = await import('./openai.js');
      return new OpenAIProvider(rest);
    }
    case 'anthropic': {
      const { AnthropicProvider } = await import('./anthropic.js');
      return new AnthropicProvider(rest);
    }
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}
