import type { FetchPolicy } from '@apollo/client/core';
import { Injectable, inject } from '@angular/core';
import {
  GET_PRODUCT,
  GET_PRODUCTS,
  SEARCH_BY_BARCODE,
  SEARCH_PRODUCTS,
} from '../../graphql/operations.graphql';
import { ApolloService } from '../apollo.service';
import { isBarcodeIgnored } from './barcode.util';
import { FacetService } from './facet.service';
import type { ProductQueryOptions } from './product-listing.service';
import { ProductCacheService } from './product-cache.service';
import { ProductMapperService } from './product-mapper.service';

/**
 * Product variant for POS
 */
export interface ProductVariant {
  id: string;
  name: string;
  sku: string;
  priceWithTax: number; // Tax-inclusive price
  stockLevel: string;
  stockOnHand?: number; // Preserved when available (product listing, stats)
  productId: string;
  productName: string;
  trackInventory?: boolean;
  featuredAsset?: {
    preview: string;
  };
  customFields?: {
    wholesalePrice?: number;
    allowFractionalQuantity?: boolean;
  };
}

/** Facet value for display (manufacturer/category pills) */
export interface ProductFacetValue {
  name: string;
  facetCode: string;
}

/**
 * Product search result
 */
export interface ProductSearchResult {
  id: string;
  name: string;
  variants: ProductVariant[];
  featuredAsset?: {
    preview: string;
  };
  /** For manufacturer/category pills (facet.code = manufacturer | category) */
  facetValues?: ProductFacetValue[];
}

/**
 * Service for searching and fetching products for POS
 */
@Injectable({
  providedIn: 'root',
})
export class ProductSearchService {
  private readonly apolloService = inject(ApolloService);
  private readonly cacheService = inject(ProductCacheService);
  private readonly facetService = inject(FacetService);
  private readonly mapper = inject(ProductMapperService);

  /**
   * Search products by name, manufacturer, SKU, or barcode (cache-first for offline support).
   * Matches when all words appear in product name or manufacturer.
   *
   * Does not filter by item availability. All matching products are returned regardless of
   * stock; callers (e.g. sell page, purchases page) decide how to handle out-of-stock items.
   *
   * @param queryOptions - Optional fetch policy; default cache-first; use network-only after mutations if needed
   */
  async searchProducts(
    searchTerm: string,
    queryOptions?: ProductQueryOptions,
  ): Promise<ProductSearchResult[]> {
    // Try cache first if available
    if (this.cacheService.isCacheReady()) {
      const cachedResults = this.cacheService.searchProducts(searchTerm);
      if (cachedResults.length > 0) {
        console.log(`📦 Returning ${cachedResults.length} products from cache`);
        return cachedResults;
      }
    }

    try {
      // First, try barcode search if the search term looks like a barcode (numeric, typically 8+ digits)
      const isLikelyBarcode = /^\d{8,}$/.test(searchTerm.trim());
      if (isLikelyBarcode) {
        const barcodeVariant = await this.searchByBarcode(searchTerm.trim());
        if (barcodeVariant) {
          return [
            {
              id: barcodeVariant.productId,
              name: barcodeVariant.productName,
              featuredAsset: barcodeVariant.featuredAsset,
              variants: [barcodeVariant],
            },
          ];
        }
      }

      // Name/manufacturer search via GET_PRODUCTS with _or filter
      const term = searchTerm.trim();
      const searchOr: Array<{
        name?: { contains: string };
        description?: { contains: string };
        slug?: { contains: string };
        sku?: { contains: string };
        facetValueId?: { in: string[] };
      }> = [
        { name: { contains: term } },
        { description: { contains: term } },
        { slug: { contains: term } },
        { sku: { contains: term } },
      ];
      const manufacturerIds = await this.facetService.getManufacturerIdsMatchingName(term);
      if (manufacturerIds.length > 0) {
        searchOr.push({ facetValueId: { in: manufacturerIds } });
      }

      const fetchPolicy = (queryOptions?.fetchPolicy ?? 'cache-first') as FetchPolicy;
      const client = this.apolloService.getClient();
      const result = await client.query<{
        products: { items: any[] };
      }>({
        query: GET_PRODUCTS,
        variables: {
          options: { filter: { _or: searchOr }, take: 20 },
        },
        fetchPolicy,
      });

      return (
        result.data?.products?.items.map((p: any) => this.mapper.toProductSearchResult(p)) || []
      );
    } catch (error) {
      console.error('Product search failed:', error);
      return [];
    }
  }

  /**
   * Get product by ID (cache-first for offline ML detection).
   * @param queryOptions - Optional fetch policy for network fallback
   */
  async getProductById(
    productId: string,
    queryOptions?: ProductQueryOptions,
  ): Promise<ProductSearchResult | null> {
    // CRITICAL: Try cache first for ML detection (offline support)
    const cachedProduct = this.cacheService.getProductById(productId);
    if (cachedProduct) {
      console.log(`📦 Product ${productId} found in cache`);
      return cachedProduct;
    }

    // Fallback to network if not in cache
    console.log(`🌐 Fetching product ${productId} from network...`);

    try {
      const fetchPolicy = (queryOptions?.fetchPolicy ?? 'cache-first') as FetchPolicy;
      const client = this.apolloService.getClient();
      const result = await client.query<{
        product: any | null;
      }>({
        query: GET_PRODUCT,
        variables: { id: productId },
        fetchPolicy,
      });

      if (!result.data?.product) {
        return null;
      }

      return this.mapper.toProductSearchResult(result.data.product);
    } catch (error) {
      console.error('Failed to fetch product:', error);
      return null;
    }
  }

  /**
   * Search by barcode
   */
  async searchByBarcode(barcode: string): Promise<ProductVariant | null> {
    if (isBarcodeIgnored(barcode)) return null;
    try {
      const client = this.apolloService.getClient();
      const result = await client.query<{
        products: {
          items: any[];
        };
      }>({
        query: SEARCH_BY_BARCODE,
        variables: { barcode: barcode },
      });

      if (!result.data?.products?.items.length) {
        return null;
      }

      const product = result.data.products.items[0];

      // Return the first variant if available
      if (!product.variants || product.variants.length === 0) {
        return null;
      }

      return this.mapper.toProductVariant(product.variants[0], product);
    } catch (error) {
      console.error('Barcode search failed:', error);
      return null;
    }
  }

  /**
   * Get recent/first N products (same shape as search results).
   * Used by Quick Select so product selection uses one consistent path.
   * Cache-first when available; otherwise fetches from network.
   */
  async getRecentProducts(limit: number): Promise<ProductSearchResult[]> {
    if (this.cacheService.isCacheReady()) {
      return this.cacheService.getRecentProducts(limit);
    }
    try {
      const fetchPolicy = 'cache-first' as FetchPolicy;
      const client = this.apolloService.getClient();
      const result = await client.query<{
        products: { items: any[] };
      }>({
        query: GET_PRODUCTS,
        variables: {
          options: { take: limit, skip: 0 },
        },
        fetchPolicy,
      });
      const items = result.data?.products?.items ?? [];
      return items.map((p: any) => this.mapper.toProductSearchResult(p));
    } catch (error) {
      console.error('Failed to load recent products:', error);
      return [];
    }
  }

  /**
   * Get variant by ID
   * Searches through cached products first, then falls back to network
   * @param variantId - Variant ID to lookup
   * @param queryOptions - Optional fetch policy for network fallback
   * @returns ProductVariant if found, null otherwise
   */
  async getVariantById(
    variantId: string,
    queryOptions?: ProductQueryOptions,
  ): Promise<ProductVariant | null> {
    // Try cache first if available
    if (this.cacheService.isCacheReady()) {
      const cachedVariant = this.cacheService.getVariantById(variantId);
      if (cachedVariant) {
        console.log(`📦 Variant ${variantId} found in cache`);
        return cachedVariant;
      }
    }

    // Fallback: Search through all products (this is less efficient but works)
    // In a production system, you might want to add a GraphQL query to get variant by ID directly
    console.log(`🌐 Variant ${variantId} not in cache, searching products...`);

    try {
      // Search for products and find the variant
      // This is a workaround - ideally we'd have a direct variant lookup query
      const fetchPolicy = (queryOptions?.fetchPolicy ?? 'cache-first') as FetchPolicy;
      const client = this.apolloService.getClient();
      const result = await client.query<{
        products: {
          items: any[];
        };
      }>({
        query: SEARCH_PRODUCTS,
        variables: { term: '' }, // Empty search to get all products (may need pagination)
        fetchPolicy,
      });

      if (!result.data?.products?.items) {
        return null;
      }

      for (const product of result.data.products.items) {
        const variant = (product.variants || []).find((v: any) => v.id === variantId);
        if (variant) {
          return this.mapper.toProductVariant(variant, product);
        }
      }

      return null;
    } catch (error) {
      console.error('Failed to fetch variant by ID:', error);
      return null;
    }
  }
}
