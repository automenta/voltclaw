import type { ChatMessage, LLMProvider } from './types.js';

export class ContextManager {
  private readonly maxMessages: number;
  private readonly summarizeCount: number;

  constructor(maxMessages: number = 50, summarizeCount: number = 20) {
    this.maxMessages = maxMessages;
    this.summarizeCount = summarizeCount;
  }

  async summarizeHistory(messages: ChatMessage[], llm: LLMProvider): Promise<ChatMessage[]> {
    if (messages.length <= this.maxMessages) {
      return messages;
    }

    // Preserve system messages at the start
    const systemMessages = messages.filter(m => m.role === 'system');
    const conversation = messages.filter(m => m.role !== 'system');

    // If conversation is too short even after filtering, return original
    if (conversation.length <= this.maxMessages) {
      return messages;
    }

    const toSummarize = conversation.slice(0, this.summarizeCount);
    const recent = conversation.slice(this.summarizeCount);

    const summaryPrompt = `Summarize the following conversation segment concisely to retain context for future turns. Focus on key decisions, facts, and outcomes.\n\n${toSummarize.map(m => `${m.role}: ${m.content}`).join('\n')}`;

    try {
      const response = await llm.chat([
        { role: 'system', content: 'You are a helpful assistant that summarizes conversation context.' },
        { role: 'user', content: summaryPrompt }
      ]);

      const summary = response.content;

      const summaryMessage: ChatMessage = {
        role: 'system',
        content: `[Previous conversation summary: ${summary}]`
      };

      return [...systemMessages, summaryMessage, ...recent];
    } catch (error) {
      console.error('Context summarization failed:', error);
      // Fallback: just return original or maybe prune without summary if critical?
      // For now, return original to be safe.
      return messages;
    }
  }
}
