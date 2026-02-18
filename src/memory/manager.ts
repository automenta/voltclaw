import { type Store, type MemoryEntry, type MemoryQuery, type LLMProvider, MemoryLevel } from '../core/types.js';
import { GraphManager } from './graph.js';

export class MemoryManager {
  private readonly store: Store;
  private readonly llm?: LLMProvider;
  public readonly graph: GraphManager;

  constructor(store: Store, llm?: LLMProvider) {
    this.store = store;
    this.llm = llm;
    this.graph = new GraphManager(store, llm);
  }

  async storeMemory(
    content: string,
    type: MemoryEntry['type'] = 'working',
    tags: string[] = [],
    importance: number = 1,
    level: MemoryLevel = MemoryLevel.Working
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

    const id = await this.store.createMemory({
      content,
      type,
      tags,
      importance,
      embedding,
      level
    });

    // Automatically extract graph entities for high importance memories
    if (importance >= 8) {
      // Run in background to avoid blocking
      this.graph.extractAndStore(content).catch(e => {
        console.error('Background graph extraction failed:', e);
      });
    }

    return id;
  }

  async promote(id: string): Promise<void> {
    if (!this.store.searchMemories || !this.store.updateMemoryLevel) return;

    // Fetch current level - Use a targeted query ideally, but standard query doesn't support ID search yet
    // Since we don't have ID search in MemoryQuery, we rely on searchMemories returning it if we filter broadly or maybe implement ID search in store.
    // However, existing recall logic uses content search.
    // Let's assume we can fetch all or use a hack.
    // Ideally, we should add 'id' to MemoryQuery. But for now, let's fetch all and filter in memory, optimized later.
    const memories = await this.store.searchMemories({});
    const memory = memories.find(m => m.id === id);
    if (memory && memory.level !== undefined && memory.level > MemoryLevel.Active) {
      // Promotion usually means moving "up" in importance, which in our enum (0=Active, 4=Archived) is surprisingly lower number?
      // Wait, "Active" (0) is most accessible. "Archived" (4) is least.
      // So "Promote" = make more active = DECREASE level index.
      // "Demote" = make less active = INCREASE level index.
      await this.store.updateMemoryLevel(id, memory.level - 1);
    }
  }

  async demote(id: string): Promise<void> {
    if (!this.store.searchMemories || !this.store.updateMemoryLevel) return;

    const memories = await this.store.searchMemories({});
    const memory = memories.find(m => m.id === id);
    if (memory && memory.level !== undefined && memory.level < MemoryLevel.Archived) {
      // Demote = move towards Archive (4) = INCREASE level index.
      await this.store.updateMemoryLevel(id, memory.level + 1);
    }
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

    // Hierarchy-based consolidation
    if (this.store.searchMemories && this.store.updateMemoryLevel) {
       const now = Date.now();
       const oneDay = 24 * 60 * 60 * 1000;

       // 1. Promote Recent (1) to Working (2) if > 1 day old
       const recent = await this.store.searchMemories({ level: MemoryLevel.Recent });
       for (const mem of recent) {
          if (now - mem.timestamp > oneDay) {
             await this.store.updateMemoryLevel(mem.id, MemoryLevel.Working);
          }
       }

       // 2. Demote Working (2) to Archived (4) if low importance and old (> 7 days)
       const working = await this.store.searchMemories({ level: MemoryLevel.Working });
       for (const mem of working) {
          if ((mem.importance ?? 0) < 3 && now - mem.timestamp > 7 * oneDay) {
             await this.store.updateMemoryLevel(mem.id, MemoryLevel.Archived);
          }
       }
    }

    await this.store.consolidateMemories();
  }
}
