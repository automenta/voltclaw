export interface Transport {
  readonly type: string;
  readonly identity: { publicKey: string };
  
  start(): Promise<void>;
  stop(): Promise<void>;
  
  send(to: string, content: string): Promise<void>;
  subscribe(handler: MessageHandler): Unsubscribe;
  
  query?(filter: QueryFilter): Promise<TransportMessage[]>;
  
  on(event: 'connected' | 'disconnected' | 'error', handler: EventHandler): void;
}

export type MessageHandler = (
  from: string,
  content: string,
  meta: MessageMeta
) => Promise<void>;

export type EventHandler = (...args: unknown[]) => void;

export interface MessageMeta {
  eventId?: string;
  timestamp?: number;
  kind?: number;
  tags?: string[][];
}

export interface TransportMessage {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: number;
  kind: number;
}

export interface QueryFilter {
  kinds?: number[];
  authors?: string[];
  tags?: Record<string, string[]>;
  since?: number;
  until?: number;
  limit?: number;
}

export type Unsubscribe = () => void;

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}
