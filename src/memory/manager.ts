import type { Store, MemoryEntry, MemoryQuery } from '../core/types.js';

export class MemoryManager {
  private readonly store: Store;

  constructor(store: Store) {
    this.store = store;
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

    return this.store.createMemory({
      content,
      type,
      tags,
      importance
    });
  }

  async recall(query: string | MemoryQuery): Promise<MemoryEntry[]> {
    if (!this.store.searchMemories) {
      return [];
    }

    const q: MemoryQuery = typeof query === 'string' ? { content: query } : query;
    return this.store.searchMemories(q);
  }

  async forget(id: string): Promise<void> {
    if (!this.store.removeMemory) {
      throw new Error('Store does not support memory operations');
    }
    await this.store.removeMemory(id);
  }
}
