import { Injectable, inject, signal } from '@angular/core';
import { PREFETCH_PRODUCTS } from '../../graphql/operations.graphql';
import { ApolloService } from '../apollo.service';
import { parseSearchWords } from './product-search-term.util';
import { ProductMapperService } from './product-mapper.service';
import { ProductSearchResult, ProductVariant } from './product-search.service';

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
 * Offline-first product cache service
 * Pre-fetches all products for a channel and maintains local cache
 */
@Injectable({
  providedIn: 'root',
})
export class ProductCacheService {
  private readonly apolloService = inject(ApolloService);
  private readonly mapper = inject(ProductMapperService);

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
   * Pre-fetch all products for the channel on boot
   * Stores in Apollo cache + in-memory for offline access
   */
  async prefetchChannelProducts(channelId: string): Promise<boolean> {
    console.log(`📦 Pre-fetching products for channel ${channelId}...`);

    this.statusSignal.update((s) => ({ ...s, isLoading: true, error: null }));

    try {
      const client = this.apolloService.getClient();

      // Fetch all products (adjust take limit as needed)
      const result = await client.query<{
        products: {
          totalItems: number;
          items: any[];
        };
      }>({
        query: PREFETCH_PRODUCTS,
        variables: { take: 100 }, // Limited to prevent list-query-limit-exceeded errors
        fetchPolicy: 'network-only', // Force fresh fetch on boot
      });

      if (!result.data?.products?.items) {
        throw new Error('No products returned from server');
      }

      const products = result.data.products.items.map((p: any) =>
        this.mapper.toProductSearchResult(p),
      );

      // Build in-memory indexes
      this.productsById.clear();
      this.productsByName.clear();

      products.forEach((product: ProductSearchResult) => {
        // Index by ID for ML detection lookup
        this.productsById.set(product.id, product);

        // Index by name for search (normalized)
        const normalizedName = product.name.toLowerCase();
        const existing = this.productsByName.get(normalizedName) || [];
        existing.push(product);
        this.productsByName.set(normalizedName, existing);
      });
      // console.log(products);
      console.log(`✅ Cached ${products.length} products locally`);

      this.statusSignal.update((s) => ({
        ...s,
        isInitialized: true,
        isLoading: false,
        productCount: products.length,
        lastSync: new Date(),
        error: null,
      }));

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
   * Search products by name and manufacturer from cache (offline-capable).
   * Matches when all words appear somewhere in product name or manufacturer.
   */
  searchProducts(searchTerm: string): ProductSearchResult[] {
    const words = parseSearchWords(searchTerm);
    if (words.length === 0 || (words.length === 1 && words[0]!.length < 2)) {
      return [];
    }

    const results: ProductSearchResult[] = [];
    for (const product of this.productsById.values()) {
      const manufacturerNames =
        product.facetValues
          ?.filter((fv) => fv.facetCode === 'manufacturer')
          .map((fv) => fv.name)
          .join(' ') ?? '';
      const searchable = `${product.name} ${manufacturerNames}`.toLowerCase();
      if (words.every((w) => searchable.includes(w))) {
        results.push(product);
      }
    }

    const firstWord = words[0] ?? '';
    return results.slice(0, 10).sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const aExact = aName.startsWith(firstWord);
      const bExact = bName.startsWith(firstWord);
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
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

  /**
   * Clear cache
   */
  clearCache(): void {
    this.productsById.clear();
    this.productsByName.clear();
    this.statusSignal.set({
      isInitialized: false,
      isLoading: false,
      productCount: 0,
      lastSync: null,
      error: null,
    });
  }
}
