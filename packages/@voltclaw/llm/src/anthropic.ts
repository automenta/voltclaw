import { BaseLLMProvider } from './provider.js';
import type {
  ChatMessage,
  ChatResponse,
  ChatOptions,
  LLMProviderConfig
} from './types.js';

interface AnthropicResponse {
  content: Array<AnthropicTextContent | AnthropicToolUseContent>;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface AnthropicTextContent {
  type: 'text';
  text: string;
}

interface AnthropicToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

type AnthropicContent = 
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string | null };

export class AnthropicProvider extends BaseLLMProvider {
  readonly name = 'anthropic';
  readonly model: string;
  readonly supportsTools = true;
  
  private baseUrl: string;
  private apiKey: string;

  constructor(config: LLMProviderConfig) {
    super(config);
    this.model = config.model;
    this.baseUrl = config.baseUrl ?? 'https://api.anthropic.com/v1';
    this.apiKey = config.apiKey ?? '';
    
    if (!this.apiKey) {
      throw new Error('Anthropic API key is required');
    }
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    await this.checkRateLimit();

    const systemMessage = messages.find(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    const toolDefs = options?.tools?.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters ?? { type: 'object' as const, properties: {} }
    }));

    const body: Record<string, unknown> = {
      model: this.model,
      messages: nonSystemMessages.map(m => this.formatMessage(m)),
      max_tokens: options?.maxTokens ?? 4096
    };

    if (systemMessage?.content) {
      body['system'] = systemMessage.content;
    }

    if (toolDefs && toolDefs.length > 0) {
      body['tools'] = toolDefs;
    }

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error');
      throw new Error(`Anthropic error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json() as AnthropicResponse;

    const textContent = data.content
      .filter((c): c is AnthropicTextContent => c.type === 'text')
      .map(c => c.text)
      .join('');

    const toolUseContent = data.content.filter((c): c is AnthropicToolUseContent => c.type === 'tool_use');

    const result: ChatResponse = {
      content: textContent
    };
    
    if (toolUseContent.length > 0) {
      result.toolCalls = toolUseContent.map(c => ({
        id: c.id,
        name: c.name,
        arguments: c.input
      }));
    }
    
    if (data.usage) {
      result.usage = {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens
      };
    }
    
    return result;
  }

  private formatMessage(msg: ChatMessage): Record<string, unknown> {
    const content: AnthropicContent[] = [];
    
    if (msg.content) {
      content.push({ type: 'text', text: msg.content });
    }
    
    if (msg.toolCalls) {
      for (const tc of msg.toolCalls) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.arguments
        });
      }
    }
    
    if (msg.role === 'tool' && msg.toolCallId) {
      return {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: msg.toolCallId,
          content: msg.content
        }]
      };
    }
    
    return {
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content
    };
  }
}
