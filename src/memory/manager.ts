import type { Store, MemoryEntry, MemoryQuery, LLMProvider } from '../core/types.js';

export class MemoryManager {
  private readonly store: Store;
  private readonly llm?: LLMProvider;

  constructor(store: Store, llm?: LLMProvider) {
    this.store = store;
    this.llm = llm;
  }

  async storeMemory(
    content: string,
    type: MemoryEntry['type'] = 'working',
    tags: string[] = [],
    importance: number = 1
  ): Promise<string> {
    if (!this.store.createMemory) {
      throw new Error('Store does not support memory operations');
    }

    let embedding: number[] | undefined;
    if (this.llm?.embed) {
      try {
        embedding = await this.llm.embed(content);
      } catch (e) {
        // Fallback or log error
        console.error('Failed to generate embedding:', e);
      }
    }

    return this.store.createMemory({
      content,
      type,
      tags,
      importance,
      embedding
    });
  }

  async recall(query: string | MemoryQuery): Promise<MemoryEntry[]> {
    if (!this.store.searchMemories) {
      return [];
    }

    const q: MemoryQuery = typeof query === 'string' ? { content: query } : { ...query };

    if (this.llm?.embed && !q.embedding) {
      const textToEmbed = q.content;
      if (textToEmbed) {
        try {
          q.embedding = await this.llm.embed(textToEmbed);
        } catch (e) {
          // Ignore embedding error, fallback to keyword search
          console.error('Failed to generate query embedding:', e);
        }
      }
    }

    return this.store.searchMemories(q);
  }

  async forget(id: string): Promise<void> {
    if (!this.store.removeMemory) {
      throw new Error('Store does not support memory operations');
    }
    await this.store.removeMemory(id);
  }

  async export(): Promise<MemoryEntry[]> {
    if (!this.store.exportMemories) {
        throw new Error('Store does not support memory export');
    }
    return this.store.exportMemories();
  }

  async consolidate(): Promise<void> {
    if (!this.store.consolidateMemories) {
        throw new Error('Store does not support memory consolidation');
    }
    await this.store.consolidateMemories();
  }
}
