import { Injectable, inject, signal } from '@angular/core';
import { PREFETCH_PRODUCTS } from '../../graphql/operations.graphql';
import { ApolloService } from '../apollo.service';
import { ProductSearchResult } from './product-search.service';

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

      // Transform and cache products
      const products = result.data.products.items.map((p: any) => ({
        id: p.id,
        name: p.name,
        featuredAsset: p.featuredAsset ? { preview: p.featuredAsset.preview } : undefined,
        variants: p.variants.map((v: any) => ({
          id: v.id,
          name: v.name,
          sku: v.sku,
          priceWithTax: v.priceWithTax?.value || v.priceWithTax || 0, // Handle Money object or direct value
          stockLevel: v.stockOnHand > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK',
          productId: p.id,
          productName: p.name,
          featuredAsset: p.featuredAsset ? { preview: p.featuredAsset.preview } : undefined,
        })),
      }));

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
   * Search products by name from cache (offline-capable)
   */
  searchProducts(searchTerm: string): ProductSearchResult[] {
    if (searchTerm.length < 2) {
      return [];
    }

    const normalized = searchTerm.toLowerCase();
    const results: ProductSearchResult[] = [];

    // Search through cached products
    for (const [name, products] of this.productsByName.entries()) {
      if (name.includes(normalized)) {
        results.push(...products);
      }
    }

    // Also search by partial name match in all products
    for (const product of this.productsById.values()) {
      const productName = product.name.toLowerCase();
      if (productName.includes(normalized) && !results.includes(product)) {
        results.push(product);
      }
    }

    // Limit results and sort by relevance
    return results.slice(0, 10).sort((a, b) => {
      // Exact match first
      const aExact = a.name.toLowerCase().startsWith(normalized);
      const bExact = b.name.toLowerCase().startsWith(normalized);
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
    for (const product of this.productsById.values()) {
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
