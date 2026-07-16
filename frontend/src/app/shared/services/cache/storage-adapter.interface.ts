/**
 * Row shape for searchable entity stores.
 * Adapter stores and returns these; search/filter logic runs in the cache layer.
 */
export interface EntityRow {
  id: string;
  searchable: string;
  payload: unknown;
}

/**
 * Storage adapter interface: decouples cache functionality from the backing store.
 * Implement with Dexie, raw IndexedDB, or in-memory for tests.
 * Search is NOT an adapter method; the cache layer uses getAll() and runs match/sort in JS.
 */
export interface ICacheStorageAdapter {
  /** Open the store for the given scope (e.g. channelId for channel DB). */
  open(scope: string): Promise<void>;

  /** Close the current store. */
  close(): Promise<void>;

  /** Delete the store for the current scope (e.g. on logout). */
  deleteScope(): Promise<void>;

  // --- Entity store (searchable tables) ---

  bulkPut(store: string, items: EntityRow[]): Promise<void>;

  get(store: string, id: string): Promise<EntityRow | undefined>;

  delete(store: string, id: string): Promise<void>;

  /** Get up to `limit` rows; used by cache layer for search/list. No search inside adapter. */
  getAll(store: string, limit?: number): Promise<EntityRow[]>;

  // --- KV store (cart, draft, session, temp) ---

  getKV(scope: string, key: string): Promise<unknown>;

  setKV(scope: string, key: string, value: unknown): Promise<void>;

  removeKV(scope: string, key: string): Promise<void>;

  /** Clear all keys in the given scope (for clearAll). */
  clearScope(scope: string): Promise<void>;
}
