import { describe, it, expect, vi } from 'vitest';
import { ContextManager } from '../../src/core/context-manager.js';
import type { ChatMessage, LLMProvider } from '../../src/core/types.js';

describe('ContextManager', () => {
  const mockLLM = {
    chat: vi.fn().mockResolvedValue({ content: 'Summary of old messages' })
  } as unknown as LLMProvider;

  it('should not summarize if message count is below limit', async () => {
    const manager = new ContextManager(10, 5);
    const messages: ChatMessage[] = Array(5).fill({ role: 'user', content: 'test' });

    const result = await manager.summarizeHistory(messages, mockLLM);

    expect(result).toEqual(messages);
    expect(mockLLM.chat).not.toHaveBeenCalled();
  });

  it('should summarize messages if count exceeds limit', async () => {
    const manager = new ContextManager(5, 2); // limit 5, summarize 2

    // 1 system, 6 user messages
    const messages: ChatMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'msg1' },
      { role: 'user', content: 'msg2' },
      { role: 'user', content: 'msg3' },
      { role: 'user', content: 'msg4' },
      { role: 'user', content: 'msg5' },
      { role: 'user', content: 'msg6' }
    ];

    const result = await manager.summarizeHistory(messages, mockLLM);

    expect(mockLLM.chat).toHaveBeenCalled();

    // Expect: system, summary, remaining messages
    // summarize 2 from 6 non-system messages -> msg1, msg2 summarized
    // remaining: msg3, msg4, msg5, msg6
    // result length: 1 (sys) + 1 (summary) + 4 (remaining) = 6
    expect(result).toHaveLength(6);
    expect(result[0].content).toBe('sys');
    expect(result[1].content).toContain('Previous conversation summary');
    expect(result[2].content).toBe('msg3');
  });

  it('should handle LLM failure gracefully', async () => {
    const errorLLM = {
      chat: vi.fn().mockRejectedValue(new Error('LLM fail'))
    } as unknown as LLMProvider;

    const manager = new ContextManager(2, 2);
    const messages: ChatMessage[] = Array(5).fill({ role: 'user', content: 'test' });

    const result = await manager.summarizeHistory(messages, errorLLM);

    expect(result).toEqual(messages); // Return original on error
  });
});
