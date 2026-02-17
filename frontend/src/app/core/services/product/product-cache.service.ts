import { Injectable, inject, signal } from '@angular/core';
import { AppCacheService } from '../cache/app-cache.service';
import { CacheSyncService } from '../cache/cache-sync.service';
import type { CacheSyncEntityHandler } from '../cache/cache-sync-handler.interface';
import { PREFETCH_PRODUCTS } from '../../graphql/operations.graphql';
import { GET_PRODUCT } from '../../graphql/operations.graphql';
import { ApolloService } from '../apollo.service';
import { ProductMapperService } from './product-mapper.service';
import { SalesSyncGuardService } from '../sales-sync-guard.service';
import { ProductSearchResult, ProductVariant } from './product-search.service';

const PRODUCTS_CACHE_KEY = 'products_list';
const PRODUCTS_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/** Max products to cache locally (perf limit; untested). Cache as many as possible up to this cap. */
const MAX_PRODUCTS_CACHE = 2000;

/** Persisted shape for product list cache */
interface ProductCachePayload {
  products: ProductSearchResult[];
  lastSync: number;
}

/**
 * Product cache status
 */
export interface CacheStatus {
  isInitialized: boolean;
  isLoading: boolean;
  productCount: number;
  lastSync: Date | null;
  error: string | null;
}

/**
 * Offline-first product cache service.
 * Pre-fetches all products for a channel and maintains an in-memory + persisted cache.
 *
 * When the cache is updated:
 * - On dashboard init: prefetchChannelProducts(channelId) runs (stale-while-revalidate if
 *   persisted cache exists).
 * - On logout / app clear: clearCache() runs (e.g. from AppInitService.clearCache).
 *
 * The cache is not invalidated after product create/update/delete. It can become stale until
 * the user re-initializes (e.g. re-open dashboard, refresh) or cache is cleared.
 */
@Injectable({
  providedIn: 'root',
})
export class ProductCacheService implements CacheSyncEntityHandler {
  readonly entityType = 'product' as const;

  private readonly apolloService = inject(ApolloService);
  private readonly appCache = inject(AppCacheService);
  private readonly salesSyncGuard = inject(SalesSyncGuardService);
  private readonly mapper = inject(ProductMapperService);
  private readonly cacheSyncService = inject(CacheSyncService);

  constructor() {
    this.cacheSyncService.registerHandler(this);
  }

  // Signals for cache status
  private readonly statusSignal = signal<CacheStatus>({
    isInitialized: false,
    isLoading: false,
    productCount: 0,
    lastSync: null,
    error: null,
  });

  // In-memory cache for instant access
  private productsById = new Map<string, ProductSearchResult>();
  private productsByName = new Map<string, ProductSearchResult[]>();

  readonly status = this.statusSignal.asReadonly();

  /**
   * Pre-fetch all products for the channel on boot.
   * Uses persisted cache when valid (stale-while-revalidate), then updates from network.
   * Does not filter by availability; all products are cached. Callers decide OOS handling.
   */
  async prefetchChannelProducts(channelId: string): Promise<boolean> {
    this.statusSignal.update((s) => ({ ...s, isLoading: true, error: null }));

    const scope = `channel:${channelId}` as const;
    const stored = await this.appCache.getKV<ProductCachePayload>(scope, PRODUCTS_CACHE_KEY);

    // Use cache if valid and not expired (24h TTL)
    const now = Date.now();
    const valid =
      stored?.products?.length &&
      stored.lastSync != null &&
      now - stored.lastSync < PRODUCTS_TTL_MS;

    if (valid && stored) {
      this.hydrateFromPayload(stored);
      console.log(`📦 Hydrated ${stored.products.length} products from cache`);
      this.statusSignal.update((s) => ({
        ...s,
        isInitialized: true,
        isLoading: false,
        productCount: stored.products.length,
        lastSync: stored.lastSync ? new Date(stored.lastSync) : null,
        error: null,
      }));
      this.prefetchFromNetwork(channelId).catch(() => {});
      return true;
    }

    return this.prefetchFromNetwork(channelId);
  }

  private hydrateFromPayload(payload: ProductCachePayload): void {
    this.productsById.clear();
    this.productsByName.clear();
    for (const product of payload.products) {
      this.productsById.set(product.id, product);
      const normalizedName = product.name.toLowerCase();
      const existing = this.productsByName.get(normalizedName) || [];
      existing.push(product);
      this.productsByName.set(normalizedName, existing);
    }
  }

  private async prefetchFromNetwork(channelId: string): Promise<boolean> {
    console.log(`📦 Pre-fetching products for channel ${channelId}...`);

    try {
      const client = this.apolloService.getClient();
      const allItems: any[] = [];
      let totalItems = 0;
      let skip = 0;

      // Fetch up to MAX_PRODUCTS_CACHE; paginate if the first response doesn't include all
      while (true) {
        const take = Math.min(MAX_PRODUCTS_CACHE - allItems.length, 2000);
        if (take <= 0) break;

        const result = await client.query<{
          products: { totalItems: number; items: any[] };
        }>({
          query: PREFETCH_PRODUCTS,
          variables: { take, skip: skip ?? 0 },
          fetchPolicy: 'network-only',
        });

        const data = result.data?.products;
        if (!data?.items) {
          throw new Error('No products returned from server');
        }

        totalItems = data.totalItems;
        allItems.push(...data.items);
        skip += data.items.length;

        const toFetch = Math.min(MAX_PRODUCTS_CACHE, totalItems);
        if (allItems.length >= toFetch || data.items.length === 0) {
          break;
        }
      }

      const products = allItems.map((p: any) => this.mapper.toProductSearchResult(p));

      this.hydrateFromPayload({ products, lastSync: Date.now() });

      const scope = `channel:${channelId}` as const;
      await this.appCache.setKV(scope, PRODUCTS_CACHE_KEY, {
        products,
        lastSync: Date.now(),
      });

      console.log(`✅ Cached ${products.length} products locally`);
      this.statusSignal.update((s) => ({
        ...s,
        isInitialized: true,
        isLoading: false,
        productCount: products.length,
        lastSync: new Date(),
        error: null,
      }));
      this.salesSyncGuard.markSynced();
      return true;
    } catch (error: any) {
      console.error('❌ Failed to prefetch products:', error);
      this.statusSignal.update((s) => ({
        ...s,
        isLoading: false,
        error: error.message || 'Failed to load products',
      }));
      return false;
    }
  }

  /**
   * Get product by ID from cache (offline-first)
   */
  getProductById(productId: string): ProductSearchResult | null {
    return this.productsById.get(productId) || null;
  }

  /**
   * Search products from cache (offline-capable).
   * Matches when the search phrase appears in product name, manufacturer, or any variant SKU
   * (phrase/substring match, case-insensitive). Aligned with products list and network search
   * for those fields. Cache does not store description/slug; matches on those only happen when
   * the network path is used (cache returned no results).
   * Does not filter by availability; callers decide how to handle out-of-stock items.
   */
  searchProducts(searchTerm: string): ProductSearchResult[] {
    const term = searchTerm.trim();
    if (term.length < 2) {
      return [];
    }
    const termLower = term.toLowerCase();

    const results: ProductSearchResult[] = [];
    for (const product of this.productsById.values()) {
      const manufacturerNames =
        product.facetValues
          ?.filter((fv) => fv.facetCode === 'manufacturer')
          .map((fv) => fv.name)
          .join(' ') ?? '';
      const variantSkus = (product.variants ?? [])
        .map((v) => v.sku)
        .filter(Boolean)
        .join(' ');
      const searchable = `${product.name} ${manufacturerNames} ${variantSkus}`.toLowerCase();
      if (searchable.includes(termLower)) {
        results.push(product);
      }
    }

    return results.slice(0, 10).sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const aStarts = aName.startsWith(termLower);
      const bStarts = bName.startsWith(termLower);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Check if cache is ready
   */
  isCacheReady(): boolean {
    return this.statusSignal().isInitialized;
  }

  /**
   * Get first N products from cache (e.g. for "recent" or quick-select).
   * Shared across Sell and other components to avoid duplicate GET_PRODUCTS.
   * Does not filter by availability.
   */
  getRecentProducts(limit: number): ProductSearchResult[] {
    return Array.from(this.productsById.values()).slice(0, limit);
  }

  /**
   * Get variant by ID from cache
   * @param variantId - Variant ID to lookup
   * @returns ProductVariant if found, null otherwise
   */
  getVariantById(variantId: string): ProductVariant | null {
    // Search through all cached products for the variant
    const products = Array.from(this.productsById.values());
    for (const product of products) {
      const variant = product.variants.find((v) => v.id === variantId);
      if (variant) {
        return variant;
      }
    }
    return null;
  }

  /** CacheSyncEntityHandler: fetch one product and update cache. */
  async hydrateOne(channelId: string, productId: string): Promise<void> {
    try {
      const client = this.apolloService.getClient();
      const result = await client.query<{ product: unknown }>({
        query: GET_PRODUCT,
        variables: { id: productId },
        fetchPolicy: 'network-only',
      });
      const raw = result.data?.product;
      if (!raw) return;
      const product = this.mapper.toProductSearchResult(raw);
      this.productsById.set(product.id, product);
      const normalizedName = product.name.toLowerCase();
      const existing = this.productsByName.get(normalizedName) ?? [];
      const without = existing.filter((p) => p.id !== product.id);
      this.productsByName.set(normalizedName, [...without, product]);
      this.statusSignal.update((s) => ({
        ...s,
        productCount: this.productsById.size,
      }));
      const scope = `channel:${channelId}` as const;
      const stored = await this.appCache.getKV<ProductCachePayload>(scope, PRODUCTS_CACHE_KEY);
      if (stored?.products) {
        const rest = stored.products.filter((p) => p.id !== product.id);
        const products = [...rest, product];
        await this.appCache.setKV(scope, PRODUCTS_CACHE_KEY, {
          products,
          lastSync: Date.now(),
        });
      }
    } catch (err) {
      console.warn('[ProductCache] hydrateOne failed', { channelId, productId }, err);
    }
  }

  /** CacheSyncEntityHandler: remove one product from cache. */
  invalidateOne(channelId: string, productId: string): void {
    const product = this.productsById.get(productId);
    if (!product) return;
    this.productsById.delete(productId);
    const normalizedName = product.name.toLowerCase();
    const list = this.productsByName.get(normalizedName);
    if (list) {
      const next = list.filter((p) => p.id !== productId);
      if (next.length) this.productsByName.set(normalizedName, next);
      else this.productsByName.delete(normalizedName);
    }
    this.statusSignal.update((s) => ({
      ...s,
      productCount: this.productsById.size,
    }));
    const scope = `channel:${channelId}` as const;
    void this.appCache.getKV<ProductCachePayload>(scope, PRODUCTS_CACHE_KEY).then((stored) => {
      if (stored?.products) {
        const products = stored.products.filter((p) => p.id !== productId);
        return this.appCache.setKV(scope, PRODUCTS_CACHE_KEY, {
          products,
          lastSync: stored.lastSync ?? Date.now(),
        });
      }
      return undefined;
    });
  }

  has(channelId: string, id: string): boolean {
    return this.productsById.has(id);
  }

  /**
   * Clear cache (memory and persisted for current channel).
   * Caller should pass channelId when known so persisted cache is cleared.
   */
  clearCache(channelId?: string): void {
    console.log('[ProductCache] clearCache', { channelId });
    this.productsById.clear();
    this.productsByName.clear();
    if (channelId) {
      const scope = `channel:${channelId}` as const;
      this.appCache.removeKV(scope, PRODUCTS_CACHE_KEY);
    }
    this.statusSignal.set({
      isInitialized: false,
      isLoading: false,
      productCount: 0,
      lastSync: null,
      error: null,
    });
  }
}
