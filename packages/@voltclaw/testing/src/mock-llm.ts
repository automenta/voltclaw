import type { ChatMessage, ChatResponse, ChatOptions, ToolCall } from 'voltclaw';

export interface MockLLMConfig {
  responses?: Record<string, string>;
  patterns?: Array<{
    match: RegExp;
    respond: (...groups: string[]) => string;
  }>;
  handler?: (messages: ChatMessage[]) => Promise<string>;
  delay?: { min: number; max: number };
  failureRate?: number;
  defaultResponse?: string;
}

export class MockLLM {
  readonly name = 'mock';
  readonly model = 'mock-model';
  readonly supportsTools = true;

  private responses: Record<string, string>;
  private patterns: Array<{ match: RegExp; respond: (...groups: string[]) => string }>;
  private customHandler?: (messages: ChatMessage[]) => Promise<string>;
  private delayConfig?: { min: number; max: number };
  private failureRate: number;
  private defaultResponse: string;
  private callCount = 0;

  constructor(config: MockLLMConfig = {}) {
    this.responses = config.responses ?? {};
    this.patterns = config.patterns ?? [];
    this.customHandler = config.handler;
    this.delayConfig = config.delay;
    this.failureRate = config.failureRate ?? 0;
    this.defaultResponse = config.defaultResponse ?? 'Mock response';
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    this.callCount++;
    
    if (Math.random() < this.failureRate) {
      throw new Error('Mock LLM failure (simulated)');
    }

    if (this.delayConfig) {
      const delay = this.delayConfig.min + 
        Math.random() * (this.delayConfig.max - this.delayConfig.min);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    const lastMessage = messages[messages.length - 1];
    const content = lastMessage?.content ?? '';

    if (this.customHandler) {
      const response = await this.customHandler(messages);
      return { content: response };
    }

    for (const [key, response] of Object.entries(this.responses)) {
      if (content.toLowerCase().includes(key.toLowerCase())) {
        return { content: response };
      }
    }

    for (const pattern of this.patterns) {
      const match = content.match(pattern.match);
      if (match) {
        const response = pattern.respond(...match.slice(1));
        return { content: response };
      }
    }

    if (options?.tools && options.tools.length > 0) {
      const toolCall = this.tryGenerateToolCall(content, options.tools);
      if (toolCall) {
        return {
          content: '',
          toolCalls: [toolCall]
        };
      }
    }

    return { content: this.defaultResponse };
  }

  private tryGenerateToolCall(content: string, tools: ChatOptions['tools']): ToolCall | null {
    const lowerContent = content.toLowerCase();
    
    for (const tool of tools ?? []) {
      if (tool.name === 'get_time' && (lowerContent.includes('time') || lowerContent.includes('date'))) {
        return {
          id: `tc_${Date.now()}`,
          name: 'get_time',
          arguments: {}
        };
      }
      
      if (tool.name === 'delegate' && (lowerContent.includes('delegate') || lowerContent.includes('subtask'))) {
        return {
          id: `tc_${Date.now()}`,
          name: 'delegate',
          arguments: { task: 'Mock delegated task' }
        };
      }
    }
    
    return null;
  }

  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  getCallCount(): number {
    return this.callCount;
  }

  reset(): void {
    this.callCount = 0;
  }
}

export function createMockLLM(config: MockLLMConfig = {}): MockLLM {
  return new MockLLM(config);
}
