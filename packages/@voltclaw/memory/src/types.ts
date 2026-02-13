export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
}

export interface SubTaskInfo {
  createdAt: number;
  task: string;
  arrived: boolean;
  result?: string;
  error?: string;
}

export interface Session {
  history: ChatMessage[];
  delegationCount: number;
  estCostUSD: number;
  actualTokensUsed: number;
  subTasks: Record<string, SubTaskInfo>;
  depth: number;
  topLevelStartedAt: number;
}

export interface Store {
  get(key: string, isSelf?: boolean): Session;
  getAll(): Record<string, Session>;
  load(): Promise<void>;
  save(): Promise<void>;
  clear(): void;
}
