import { Injectable, signal } from '@angular/core';

/**
 * Cache storage interface for different storage backends
 */
export interface CacheStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}

/**
 * localStorage implementation
 */
class LocalStorageCache implements CacheStorage {
  getItem(key: string): string | null {
    return localStorage.getItem(key);
  }

  setItem(key: string, value: string): void {
    localStorage.setItem(key, value);
  }

  removeItem(key: string): void {
    localStorage.removeItem(key);
  }

  clear(): void {
    localStorage.clear();
  }
}

/**
 * sessionStorage implementation
 */
class SessionStorageCache implements CacheStorage {
  getItem(key: string): string | null {
    return sessionStorage.getItem(key);
  }

  setItem(key: string, value: string): void {
    sessionStorage.setItem(key, value);
  }

  removeItem(key: string): void {
    sessionStorage.removeItem(key);
  }

  clear(): void {
    sessionStorage.clear();
  }
}

/**
 * In-memory cache implementation
 */
class MemoryCache implements CacheStorage {
  private storage = new Map<string, string>();

  getItem(key: string): string | null {
    return this.storage.get(key) || null;
  }

  setItem(key: string, value: string): void {
    this.storage.set(key, value);
  }

  removeItem(key: string): void {
    this.storage.delete(key);
  }

  clear(): void {
    this.storage.clear();
  }
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  storage: 'localStorage' | 'sessionStorage' | 'memory';
  keyPrefix: string;
  ttl?: number; // Time to live in milliseconds
  channelSpecific?: boolean;
}

/**
 * Cache entry with metadata
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl?: number;
}

/**
 * Unified cache service following existing patterns
 * Extends the localStorage pattern used in company.service.ts
 */
@Injectable({
  providedIn: 'root',
})
export class CacheService {
  private readonly storages: Record<string, CacheStorage> = {
    localStorage: new LocalStorageCache(),
    sessionStorage: new SessionStorageCache(),
    memory: new MemoryCache(),
  };

  // Cache status signals
  readonly status = signal<{
    isInitialized: boolean;
    error: string | null;
  }>({
    isInitialized: false,
    error: null,
  });

  /**
   * Get cache storage instance
   */
  private getStorage(type: 'localStorage' | 'sessionStorage' | 'memory'): CacheStorage {
    return this.storages[type];
  }

  /**
   * Generate cache key with prefix and optional channel
   */
  private generateKey(config: CacheConfig, key: string, channelId?: string): string {
    let fullKey = `${config.keyPrefix}_${key}`;
    if (config.channelSpecific && channelId) {
      fullKey = `${fullKey}_${channelId}`;
    }
    return fullKey;
  }

  /**
   * Check if cache entry is expired
   */
  private isExpired(entry: CacheEntry<any>): boolean {
    if (!entry.ttl) return false;
    return Date.now() - entry.timestamp > entry.ttl;
  }

  /**
   * Store data in cache
   */
  set<T>(config: CacheConfig, key: string, data: T, channelId?: string): void {
    try {
      const storage = this.getStorage(config.storage);
      const cacheKey = this.generateKey(config, key, channelId);

      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        ttl: config.ttl,
      };

      storage.setItem(cacheKey, JSON.stringify(entry));
      console.log(`💾 Cached ${key} in ${config.storage}`);
    } catch (error) {
      console.error(`Failed to cache ${key}:`, error);
      this.status.update((s) => ({ ...s, error: `Failed to cache ${key}` }));
    }
  }

  /**
   * Retrieve data from cache
   */
  get<T>(config: CacheConfig, key: string, channelId?: string): T | null {
    try {
      const storage = this.getStorage(config.storage);
      const cacheKey = this.generateKey(config, key, channelId);

      const stored = storage.getItem(cacheKey);
      if (!stored) return null;

      const entry: CacheEntry<T> = JSON.parse(stored);

      // Check if expired
      if (this.isExpired(entry)) {
        this.remove(config, key, channelId);
        return null;
      }

      console.log(`📦 Retrieved ${key} from ${config.storage}`);
      return entry.data;
    } catch (error) {
      console.error(`Failed to retrieve ${key}:`, error);
      this.status.update((s) => ({ ...s, error: `Failed to retrieve ${key}` }));
      return null;
    }
  }

  /**
   * Remove data from cache
   */
  remove(config: CacheConfig, key: string, channelId?: string): void {
    try {
      const storage = this.getStorage(config.storage);
      const cacheKey = this.generateKey(config, key, channelId);
      storage.removeItem(cacheKey);
      console.log(`🗑️ Removed ${key} from ${config.storage}`);
    } catch (error) {
      console.error(`Failed to remove ${key}:`, error);
      this.status.update((s) => ({ ...s, error: `Failed to remove ${key}` }));
    }
  }

  /**
   * Clear all cache entries for a config
   */
  clear(config: CacheConfig, channelId?: string): void {
    try {
      const storage = this.getStorage(config.storage);
      const prefix = this.generateKey(config, '', channelId);

      // For localStorage/sessionStorage, we need to iterate through keys
      if (config.storage === 'localStorage' || config.storage === 'sessionStorage') {
        const keysToRemove: string[] = [];

        // Get all keys from the actual storage object
        const storageObj =
          config.storage === 'localStorage' ? window.localStorage : window.sessionStorage;
        const allKeys = Object.keys(storageObj);

        // Filter keys by prefix
        for (const key of allKeys) {
          if (key.startsWith(prefix)) {
            keysToRemove.push(key);
          }
        }

        keysToRemove.forEach((key) => storage.removeItem(key));
      } else {
        // For memory cache, we can clear all
        storage.clear();
      }

      console.log(`🧹 Cleared cache for ${config.keyPrefix}`);
    } catch (error) {
      console.error(`Failed to clear cache:`, error);
      this.status.update((s) => ({ ...s, error: 'Failed to clear cache' }));
    }
  }

  /**
   * Clear all cache entries for all cache configs
   * Useful for complete cache invalidation (e.g., on login)
   */
  clearAll(): void {
    try {
      // Clear all predefined cache configs
      Object.values(CACHE_CONFIGS).forEach((config) => {
        // For channel-specific caches, we need to clear all possible channel combinations
        // Since we don't know all channel IDs, we'll clear by prefix pattern
        if (config.channelSpecific) {
          // Clear all keys matching the prefix pattern (with or without channel ID)
          const storage = this.getStorage(config.storage);
          const prefix = config.keyPrefix + '_';

          if (config.storage === 'localStorage' || config.storage === 'sessionStorage') {
            const storageObj =
              config.storage === 'localStorage' ? window.localStorage : window.sessionStorage;
            const allKeys = Object.keys(storageObj);

            allKeys.forEach((key) => {
              if (key.startsWith(prefix)) {
                storage.removeItem(key);
              }
            });
          } else {
            // For memory cache, clear all
            storage.clear();
          }
        } else {
          // For non-channel-specific caches, clear normally
          this.clear(config);
        }
      });

      console.log('🧹 Cleared all cache configs');
    } catch (error) {
      console.error('Failed to clear all caches:', error);
      this.status.update((s) => ({ ...s, error: 'Failed to clear all caches' }));
    }
  }

  /**
   * Check if cache has key
   */
  has(config: CacheConfig, key: string, channelId?: string): boolean {
    return this.get(config, key, channelId) !== null;
  }

  /**
   * Get cache size (approximate)
   */
  getSize(config: CacheConfig, channelId?: string): number {
    try {
      const storage = this.getStorage(config.storage);
      const prefix = this.generateKey(config, '', channelId);
      let count = 0;

      if (config.storage === 'localStorage' || config.storage === 'sessionStorage') {
        // This is a simplified approach - in practice you'd need to track keys
        for (let i = 0; i < 1000; i++) {
          // Reasonable limit
          const key = storage.getItem(`key_${i}`);
          if (key && key.startsWith(prefix)) {
            count++;
          }
        }
      } else {
        // For memory cache, we can't easily count
        count = -1; // Unknown
      }

      return count;
    } catch (error) {
      console.error('Failed to get cache size:', error);
      return -1;
    }
  }

  /**
   * Clear error state
   */
  clearError(): void {
    this.status.update((s) => ({ ...s, error: null }));
  }
}

/**
 * Predefined cache configurations following existing patterns
 */
export const CACHE_CONFIGS = {
  // Cart cache - channel-specific, persistent
  CART: {
    storage: 'localStorage' as const,
    keyPrefix: 'dukarun_cart',
    channelSpecific: true,
  },

  // Product cache - channel-specific, persistent
  PRODUCTS: {
    storage: 'localStorage' as const,
    keyPrefix: 'dukarun_products',
    channelSpecific: true,
  },

  // Session cache - global, persistent
  SESSION: {
    storage: 'localStorage' as const,
    keyPrefix: 'dukarun_session',
    channelSpecific: false,
  },

  // Temporary cache - channel-specific, session-only
  TEMP: {
    storage: 'sessionStorage' as const,
    keyPrefix: 'dukarun_temp',
    channelSpecific: true,
  },
} as const;
