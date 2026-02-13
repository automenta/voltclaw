export * from '../core/types.js';

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

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}
