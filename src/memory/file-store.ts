import type { Store, Session, SubTaskInfo, ChatMessage, ScheduledTask } from '../core/types.js';
import fs from 'fs/promises';
import path from 'path';

export type { Store, Session, SubTaskInfo, ChatMessage, ScheduledTask };

export interface FileStoreConfig {
  path: string;
  maxHistory?: number;
}

export class FileStore implements Store {
  private data: Record<string, Session> = {};
  private tasks: ScheduledTask[] = [];
  private readonly maxHistory: number;

  constructor(private config: FileStoreConfig) {
    this.maxHistory = config.maxHistory ?? 60;
  }

  private get tasksPath(): string {
    const dir = path.dirname(this.config.path);
    const ext = path.extname(this.config.path);
    const base = path.basename(this.config.path, ext);
    return path.join(dir, `${base}-tasks${ext}`);
  }

  async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.config.path, 'utf-8');
      this.data = JSON.parse(content) as Record<string, Session>;
    } catch {
      this.data = {};
    }

    try {
      const content = await fs.readFile(this.tasksPath, 'utf-8');
      this.tasks = JSON.parse(content) as ScheduledTask[];
    } catch {
      this.tasks = [];
    }
  }

  async save(): Promise<void> {
    try {
      const dir = path.dirname(this.config.path);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.config.path, JSON.stringify(this.data, null, 2));
      await fs.writeFile(this.tasksPath, JSON.stringify(this.tasks, null, 2));
    } catch {
      // Silently fail
    }
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

  pruneAll(): void {
    for (const key of Object.keys(this.data)) {
      this.prune(key);
    }
  }

  async scheduleTask(task: ScheduledTask): Promise<void> {
    const index = this.tasks.findIndex(t => t.id === task.id);
    if (index >= 0) {
      this.tasks[index] = task;
    } else {
      this.tasks.push(task);
    }
    await this.save();
  }

  async getScheduledTasks(): Promise<ScheduledTask[]> {
    return [...this.tasks];
  }

  async deleteScheduledTask(id: string): Promise<void> {
    this.tasks = this.tasks.filter(t => t.id !== id);
    await this.save();
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
