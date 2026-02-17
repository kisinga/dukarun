import Dexie, { type EntityTable } from 'dexie';
import type { EntityRow, ICacheStorageAdapter } from '../storage-adapter.interface';

const CHANNEL_DB_PREFIX = 'dukarun_cache_';
const GLOBAL_DB_NAME = 'dukarun_cache_global';

interface KvRecord {
  id: string;
  value: unknown;
}

class ChannelDb extends Dexie {
  products!: EntityTable<EntityRow, 'id'>;
  customers!: EntityTable<EntityRow, 'id'>;
  suppliers!: EntityTable<EntityRow, 'id'>;
  sessionState!: EntityTable<EntityRow, 'id'>;
  kv!: EntityTable<KvRecord, 'id'>;

  constructor(channelId: string) {
    super(`${CHANNEL_DB_PREFIX}${channelId}`);
    this.version(1).stores({
      products: 'id',
      customers: 'id',
      suppliers: 'id',
      sessionState: 'id',
      kv: 'id',
    });
  }
}

class GlobalDb extends Dexie {
  kv!: EntityTable<KvRecord, 'id'>;

  constructor() {
    super(GLOBAL_DB_NAME);
    this.version(1).stores({
      kv: 'id',
    });
  }
}

/**
 * Dexie-backed storage adapter. One channel DB per channel + one global DB for global/session KV.
 * Implements ICacheStorageAdapter; no Dexie types leak from the cache module's public API.
 */
export class DexieCacheAdapter implements ICacheStorageAdapter {
  private channelDb: ChannelDb | null = null;
  private currentChannelId: string | null = null;
  private readonly globalDb = new GlobalDb();

  async open(scope: string): Promise<void> {
    if (scope.startsWith('channel:')) {
      const channelId = scope.slice(8);
      if (this.currentChannelId === channelId && this.channelDb) {
        return;
      }
      await this.close();
      this.channelDb = new ChannelDb(channelId);
      this.currentChannelId = channelId;
      await this.channelDb.open();
    }
  }

  private async ensureGlobalOpen(): Promise<void> {
    if (!this.globalDb.isOpen()) {
      await this.globalDb.open();
    }
  }

  async close(): Promise<void> {
    if (this.channelDb) {
      this.channelDb.close();
      this.channelDb = null;
      this.currentChannelId = null;
    }
  }

  async deleteScope(): Promise<void> {
    if (this.currentChannelId) {
      const name = `${CHANNEL_DB_PREFIX}${this.currentChannelId}`;
      this.channelDb?.close();
      this.channelDb = null;
      this.currentChannelId = null;
      await Dexie.delete(name);
    }
  }

  private getChannelDb(): ChannelDb {
    if (!this.channelDb) {
      throw new Error('Channel DB not open; call open(scope) with channel scope first.');
    }
    return this.channelDb;
  }

  async bulkPut(store: string, items: EntityRow[]): Promise<void> {
    const db = this.getChannelDb();
    const table = (
      db as unknown as Record<string, { bulkPut: (items: EntityRow[]) => Promise<unknown> }>
    )[store];
    if (!table) throw new Error(`Unknown store: ${store}`);
    await table.bulkPut(items);
  }

  async get(store: string, id: string): Promise<EntityRow | undefined> {
    const db = this.getChannelDb();
    const table = (
      db as unknown as Record<string, { get: (id: string) => Promise<EntityRow | undefined> }>
    )[store];
    if (!table) throw new Error(`Unknown store: ${store}`);
    return table.get(id);
  }

  async delete(store: string, id: string): Promise<void> {
    const db = this.getChannelDb();
    const table = (db as unknown as Record<string, { delete: (id: string) => Promise<void> }>)[
      store
    ];
    if (!table) throw new Error(`Unknown store: ${store}`);
    await table.delete(id);
  }

  async getAll(store: string, limit?: number): Promise<EntityRow[]> {
    const db = this.getChannelDb();
    const table = (db as unknown as Record<string, { toArray: () => Promise<EntityRow[]> }>)[store];
    if (!table) throw new Error(`Unknown store: ${store}`);
    const all = await table.toArray();
    return limit != null ? all.slice(0, limit) : all;
  }

  private kvKey(scope: string, key: string): string {
    if (scope.startsWith('channel:')) {
      return key;
    }
    return `${scope}::${key}`;
  }

  private isChannelScope(scope: string): boolean {
    return scope.startsWith('channel:') && scope === `channel:${this.currentChannelId}`;
  }

  async getKV(scope: string, key: string): Promise<unknown> {
    const id = this.kvKey(scope, key);
    if (this.isChannelScope(scope) && this.channelDb) {
      const rec = await this.channelDb.kv.get(id);
      return rec?.value;
    }
    await this.ensureGlobalOpen();
    const rec = await this.globalDb.kv.get(id);
    return rec?.value;
  }

  async setKV(scope: string, key: string, value: unknown): Promise<void> {
    const id = this.kvKey(scope, key);
    if (this.isChannelScope(scope) && this.channelDb) {
      await this.channelDb.kv.put({ id, value });
      return;
    }
    await this.ensureGlobalOpen();
    await this.globalDb.kv.put({ id, value });
  }

  async removeKV(scope: string, key: string): Promise<void> {
    const id = this.kvKey(scope, key);
    if (this.isChannelScope(scope) && this.channelDb) {
      await this.channelDb.kv.delete(id);
      return;
    }
    await this.ensureGlobalOpen();
    await this.globalDb.kv.delete(id);
  }

  async clearScope(scope: string): Promise<void> {
    if (
      scope.startsWith('channel:') &&
      scope === `channel:${this.currentChannelId}` &&
      this.channelDb
    ) {
      await this.channelDb.kv.clear();
      return;
    }
    await this.ensureGlobalOpen();
    const prefix = `${scope}::`;
    const keys = await this.globalDb.kv.where('id').startsWith(prefix).keys();
    await this.globalDb.kv.bulkDelete(keys as string[]);
  }
}
