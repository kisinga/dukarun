import type { EntityRow, ICacheStorageAdapter } from '../storage-adapter.interface';

/**
 * In-memory storage adapter for tests. Implements ICacheStorageAdapter without IndexedDB.
 */
export class MemoryCacheAdapter implements ICacheStorageAdapter {
  private currentScope: string | null = null;
  private readonly entityStores = new Map<string, Map<string, EntityRow>>();
  private readonly kvStores = new Map<string, Map<string, unknown>>();

  async open(scope: string): Promise<void> {
    this.currentScope = scope;
  }

  async close(): Promise<void> {
    this.currentScope = null;
  }

  async deleteScope(): Promise<void> {
    if (this.currentScope?.startsWith('channel:')) {
      const channelId = this.currentScope.slice(8);
      const prefix = `channel:${channelId}`;
      this.entityStores.delete(`channel:${channelId}:products`);
      this.entityStores.delete(`channel:${channelId}:customers`);
      this.entityStores.delete(`channel:${channelId}:suppliers`);
      this.entityStores.delete(`channel:${channelId}:sessionState`);
      this.kvStores.delete(prefix);
    }
    this.currentScope = null;
  }

  private entityKey(store: string): string {
    if (!this.currentScope?.startsWith('channel:')) {
      throw new Error('Channel not open');
    }
    return `${this.currentScope}:${store}`;
  }

  private getEntityMap(store: string): Map<string, EntityRow> {
    const key = this.entityKey(store);
    let map = this.entityStores.get(key);
    if (!map) {
      map = new Map();
      this.entityStores.set(key, map);
    }
    return map;
  }

  private getKvMap(scope: string): Map<string, unknown> {
    let map = this.kvStores.get(scope);
    if (!map) {
      map = new Map();
      this.kvStores.set(scope, map);
    }
    return map;
  }

  async bulkPut(store: string, items: EntityRow[]): Promise<void> {
    const map = this.getEntityMap(store);
    for (const item of items) {
      map.set(item.id, item);
    }
  }

  async get(store: string, id: string): Promise<EntityRow | undefined> {
    return this.getEntityMap(store).get(id);
  }

  async delete(store: string, id: string): Promise<void> {
    this.getEntityMap(store).delete(id);
  }

  async getAll(store: string, limit?: number): Promise<EntityRow[]> {
    const arr = Array.from(this.getEntityMap(store).values());
    return limit != null ? arr.slice(0, limit) : arr;
  }

  private kvId(scope: string, key: string): string {
    return scope.startsWith('channel:') ? key : `${scope}::${key}`;
  }

  async getKV(scope: string, key: string): Promise<unknown> {
    return this.getKvMap(scope).get(this.kvId(scope, key));
  }

  async setKV(scope: string, key: string, value: unknown): Promise<void> {
    this.getKvMap(scope).set(this.kvId(scope, key), value);
  }

  async removeKV(scope: string, key: string): Promise<void> {
    this.getKvMap(scope).delete(this.kvId(scope, key));
  }

  async clearScope(scope: string): Promise<void> {
    this.kvStores.delete(scope);
  }
}
