import fs from 'fs/promises';
import path from 'path';

export interface FailedOperation {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  error: string;
  timestamp: Date;
  retryCount: number;
}

export interface DLQStore {
  save(op: FailedOperation): Promise<void>;
  list(): Promise<FailedOperation[]>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
  get(id: string): Promise<FailedOperation | undefined>;
}

export class InMemoryDLQ implements DLQStore {
  private queue: Map<string, FailedOperation> = new Map();

  async save(op: FailedOperation): Promise<void> {
    this.queue.set(op.id, op);
  }

  async list(): Promise<FailedOperation[]> {
    return Array.from(this.queue.values());
  }

  async remove(id: string): Promise<void> {
    this.queue.delete(id);
  }

  async clear(): Promise<void> {
    this.queue.clear();
  }

  async get(id: string): Promise<FailedOperation | undefined> {
    return this.queue.get(id);
  }
}

export class FileDLQ implements DLQStore {
  private queue: Map<string, FailedOperation> = new Map();
  private readonly path: string;

  constructor(pathStr: string) {
    this.path = pathStr;
  }

  private async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.path, 'utf-8');
      const ops = JSON.parse(data) as FailedOperation[];
      this.queue = new Map(ops.map(op => [op.id, {
        ...op,
        timestamp: new Date(op.timestamp)
      }]));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Ignore error if file doesn't exist
        this.queue.clear();
      } else {
        throw error;
      }
    }
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.path), { recursive: true });
    const ops = Array.from(this.queue.values());
    await fs.writeFile(this.path, JSON.stringify(ops, null, 2));
  }

  async save(op: FailedOperation): Promise<void> {
    await this.load();
    this.queue.set(op.id, op);
    await this.persist();
  }

  async list(): Promise<FailedOperation[]> {
    await this.load();
    return Array.from(this.queue.values());
  }

  async remove(id: string): Promise<void> {
    await this.load();
    this.queue.delete(id);
    await this.persist();
  }

  async clear(): Promise<void> {
    this.queue.clear();
    await this.persist();
  }

  async get(id: string): Promise<FailedOperation | undefined> {
    await this.load();
    return this.queue.get(id);
  }
}

export class DeadLetterQueue {
  private readonly store: DLQStore;

  constructor(store?: DLQStore) {
    this.store = store ?? new InMemoryDLQ();
  }

  async push(tool: string, args: Record<string, unknown>, error: Error, retryCount: number = 0): Promise<string> {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const op: FailedOperation = {
      id,
      tool,
      args,
      error: error.message,
      timestamp: new Date(),
      retryCount
    };
    await this.store.save(op);
    return id;
  }

  async list(): Promise<FailedOperation[]> {
    return this.store.list();
  }

  async remove(id: string): Promise<void> {
    await this.store.remove(id);
  }

  async clear(): Promise<void> {
    await this.store.clear();
  }

  async get(id: string): Promise<FailedOperation | undefined> {
    return this.store.get(id);
  }
}
