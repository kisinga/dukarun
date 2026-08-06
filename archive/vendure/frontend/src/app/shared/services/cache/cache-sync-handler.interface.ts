/** Entity types aligned with backend cache-sync.types.CacheSyncEntityType */
export type CacheSyncEntityType = 'product' | 'payment_method' | 'customer' | 'supplier' | 'order';

/**
 * Handler interface for entity caches. Register with CacheSyncService so the cache layer
 * can hydrate or invalidate when SSE events arrive (live or catch-up).
 *
 * Only implement the methods your entity needs:
 * - Entities that can refetch a single item from the server: provide hydrateOne (and optionally has).
 * - Entities that are list-only (no per-id server fetch): provide invalidateOne only; created/updated
 *   will trigger invalidateOne so the next read refetches the list.
 * - For deleted events, invalidateOne is used when provided.
 * At least one of hydrateOne or invalidateOne must be provided.
 */
export interface CacheSyncEntityHandler {
  readonly entityType: CacheSyncEntityType;

  /**
   * When provided: fetch the entity by id and update local cache. Called for created/updated events.
   * Omit for list-only caches that only need invalidation (next read will refetch).
   */
  hydrateOne?(channelId: string, id: string): Promise<void>;

  /**
   * When provided: remove or invalidate the entity in local cache. Called for deleted events,
   * and for created/updated when hydrateOne is not provided (list-only invalidation).
   */
  invalidateOne?(channelId: string, id: string): void | Promise<void>;

  /**
   * When provided and hydrateOne is used: return true to skip hydrateOne and avoid redundant fetch.
   */
  has?(channelId: string, id: string): boolean;
}
