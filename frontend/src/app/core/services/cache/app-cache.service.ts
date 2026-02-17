import { inject, Injectable, Injector } from '@angular/core';
import { CompanyService } from '../company.service';
import { DexieCacheAdapter } from './adapters/dexie-adapter';
import * as primitives from './cache-primitives';
import type { ICacheStorageAdapter } from './storage-adapter.interface';

/**
 * Scopes for the single app-wide cache.
 * - channel:{channelId} — channel-specific (cart, drafts)
 * - global — cross-session
 * - session — current tab/session
 */
export type CacheScope = `channel:${string}` | 'global' | 'session';

/**
 * Single app-wide cache facade. Exposes KV API and clearAll for auth/logout.
 * Uses Dexie adapter by default; adapter can be swapped for tests.
 */
@Injectable({
  providedIn: 'root',
})
export class AppCacheService {
  private readonly adapter: ICacheStorageAdapter = new DexieCacheAdapter();
  private readonly injector = inject(Injector);

  /**
   * Ensure channel scope is open when using channel:{id}. No-op for global/session.
   */
  private async ensureChannelOpen(scope: CacheScope): Promise<void> {
    if (scope.startsWith('channel:')) {
      await this.adapter.open(scope);
    }
  }

  async getKV<T = unknown>(scope: CacheScope, key: string): Promise<T | undefined> {
    await this.ensureChannelOpen(scope);
    return primitives.getKV<T>(this.adapter, scope, key);
  }

  async setKV(scope: CacheScope, key: string, value: unknown): Promise<void> {
    await this.ensureChannelOpen(scope);
    await primitives.setKV(this.adapter, scope, key, value);
  }

  async removeKV(scope: CacheScope, key: string): Promise<void> {
    await this.ensureChannelOpen(scope);
    await primitives.removeKV(this.adapter, scope, key);
  }

  /**
   * Clear all cache: delete current channel DB and clear global + session scopes.
   * Call on logout. Safe to call even if no channel is active.
   */
  async clearAll(): Promise<void> {
    const channelId = this.injector.get(CompanyService).activeCompanyId();
    if (channelId) {
      await this.adapter.open(`channel:${channelId}`);
      await this.adapter.deleteScope();
    }
    await primitives.clearScope(this.adapter, 'global');
    await primitives.clearScope(this.adapter, 'session');
    console.log('🧹 App cache cleared (channel + global + session)');
  }

  // --- Optional: expose adapter for entity search/list (future use) ---
  getAdapter(): ICacheStorageAdapter {
    return this.adapter;
  }
}
