import type { Store, Session, SubTaskInfo, ChatMessage } from '../core/types.js';
import fs from 'fs/promises';
import path from 'path';

export type { Store, Session, SubTaskInfo, ChatMessage };

export interface FileStoreConfig {
  path: string;
  maxHistory?: number;
}

export class FileStore implements Store {
  private data: Record<string, Session> = {};
  private readonly maxHistory: number;

  constructor(private config: FileStoreConfig) {
    this.maxHistory = config.maxHistory ?? 60;
  }

  async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.config.path, 'utf-8');
      this.data = JSON.parse(content) as Record<string, Session>;
    } catch {
      this.data = {};
    }
  }

  async save(): Promise<void> {
    try {
      const dir = path.dirname(this.config.path);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.config.path, JSON.stringify(this.data, null, 2));
    } catch {
      // Silently fail
    }
  }

  get(key: string, isSelf = false): Session {
    const sessionKey = isSelf ? 'self' : key;
    
    if (!this.data[sessionKey]) {
      this.data[sessionKey] = this.createSession();
    }
    
    return this.data[sessionKey];
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

  pruneAll(): void {
    for (const key of Object.keys(this.data)) {
      this.prune(key);
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
      topLevelStartedAt: 0
    };
  }
}
