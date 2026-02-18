import type { Store, Session, SubTaskInfo, ChatMessage } from '../core/types.js';

export type { Store, Session, SubTaskInfo, ChatMessage };

export class MemoryStore implements Store {
  private data: Record<string, Session> = {};
  private readonly maxHistory: number;

  constructor(maxHistory = 60) {
    this.maxHistory = maxHistory;
  }

  async load(): Promise<void> {
    // No-op for in-memory store
  }

  async save(): Promise<void> {
    // No-op for in-memory store
  }

  get(key: string, isSelf = false): Session {
    const sessionKey = isSelf ? 'self' : key;
    
    if (!this.data[sessionKey]) {
      this.data[sessionKey] = this.createSession();
    }
    
    const session = this.data[sessionKey];
    session.id = sessionKey;
    return session;
  }

  getAll(): Record<string, Session> {
    return { ...this.data };
  }

  clear(): void {
    this.data = {};
  }

  prune(key: string): void {
    const session = this.get(key);
    if (session.history.length > this.maxHistory) {
      session.history = session.history.slice(-this.maxHistory);
    }
  }

  private createSession(): Session {
    return {
      history: [],
      callCount: 0,
      estCostUSD: 0,
      actualTokensUsed: 0,
      subTasks: {},
      depth: 0,
      topLevelStartedAt: 0,
      sharedData: {}
    };
  }
}
