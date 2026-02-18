import type { LLMProvider, ChatMessage } from './types.js';

export interface ContextManagerOptions {
  maxMessages?: number;
  preserveLast?: number;
}

export class ContextManager {
  private readonly llm: LLMProvider;
  private readonly maxMessages: number;
  private readonly preserveLast: number;

  constructor(llm: LLMProvider, options: ContextManagerOptions = {}) {
    this.llm = llm;
    this.maxMessages = options.maxMessages ?? 50;
    this.preserveLast = options.preserveLast ?? 20;
  }

  async manageContext(messages: ChatMessage[]): Promise<ChatMessage[]> {
    if (messages.length <= this.maxMessages) {
      return messages;
    }

    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    if (nonSystemMessages.length <= this.maxMessages) {
      return messages;
    }

    // We only summarize if we have enough messages to make it worthwhile
    // e.g., if maxMessages=5, preserveLast=2, total=6 (non-system)
    // toSummarize = 6 - 2 = 4 messages.

    // Wait, the check above (nonSystemMessages.length <= this.maxMessages) handles the threshold.
    // If maxMessages=5 and we have 5 non-system messages, we return.
    // If we have 6, we summarize.

    const toSummarize = nonSystemMessages.slice(0, nonSystemMessages.length - this.preserveLast);
    const toKeep = nonSystemMessages.slice(nonSystemMessages.length - this.preserveLast);

    if (toSummarize.length === 0) {
      return messages;
    }

    const summary = await this.summarize(toSummarize);

    const summaryMessage: ChatMessage = {
      role: 'system',
      content: `Previous conversation summary:\n${summary}`
    };

    return [...systemMessages, summaryMessage, ...toKeep];
  }

  private async summarize(messages: ChatMessage[]): Promise<string> {
    const text = messages
      .map(m => `${m.role.toUpperCase()}: ${m.content || '[tool call]'}`)
      .join('\n');

    const prompt = `Summarize the following conversation history concisely, capturing key decisions, tool outputs, and user requests. Focus on what is relevant for future actions.\n\n${text}`;

    try {
      const response = await this.llm.chat([
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: prompt }
      ]);
      return response.content;
    } catch (error) {
      console.warn('Context summarization failed, returning truncated history instead.', error);
      return '[Summary generation failed]';
    }
  }
}
