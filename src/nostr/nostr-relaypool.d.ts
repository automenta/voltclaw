declare module 'nostr-relaypool' {
  export class RelayPool {
    relayByUrl: Map<string, unknown>;
    addOrGetRelay(url: string): void;
    removeRelay(url: string): void;
    subscribe(
      filters: Array<Record<string, unknown>>,
      relays: string[],
      cb: (event: unknown) => void,
      maxDelayms?: number,
      maxEoseCount?: number,
      options?: { unsubscribeOnEose?: boolean }
    ): () => void;
    publish(event: unknown, relays: string[]): void;
  }
}
