export { NostrClient, generateNewKeyPair, resolveToHex, getPublicKeyFromSecret, nip19, type NostrClientOptions } from './client.js';
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
