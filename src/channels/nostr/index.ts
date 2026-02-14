export { NostrClient, generateNewKeyPair, resolveToHex, type NostrClientOptions } from './client.js';
export type {
  Channel,
  Transport, // Deprecated alias
  MessageHandler,
  MessageMeta,
  QueryFilter,
  ChannelMessage,
  TransportMessage, // Deprecated alias
  NostrEvent,
  Unsubscribe,
  EventHandler
} from './types.js';
