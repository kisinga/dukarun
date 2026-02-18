/** Entity types emitted by the cache-sync SSE stream. Frontend must align. */
export type CacheSyncEntityType = 'product' | 'payment_method' | 'customer' | 'supplier' | 'order';

export type CacheSyncAction = 'created' | 'updated' | 'deleted';

/** SSE message contract; frontend cache-sync.service uses the same shape. */
export interface CacheSyncMessage {
  entityType: CacheSyncEntityType;
  action: CacheSyncAction;
  channelId: string;
  id?: string;
}
