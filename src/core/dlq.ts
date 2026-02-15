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
}
