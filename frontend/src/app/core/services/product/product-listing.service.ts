import type { FetchPolicy } from '@apollo/client/core';
import { inject, Injectable } from '@angular/core';
import type {
  ProductListOptions,
  GetProductsQuery,
  GetProductsByInventoryAlertQuery,
  InventoryAlertFilter,
} from '../../graphql/generated/graphql';
import { extractCents } from '../../utils/data-extractors';
import { GET_PRODUCTS, GET_PRODUCTS_BY_INVENTORY_ALERT } from '../../graphql/operations.graphql';
import { ApolloService } from '../apollo.service';
import { ProductMapperService } from './product-mapper.service';
import { ProductStateService } from './product-state.service';

const DEFAULT_OPTIONS: ProductListOptions = { take: 50, skip: 0 };

/** Allowed fetch policy for product list queries (cache-first default for resilience; network-only after mutations). */
export type ProductQueryFetchPolicy = 'cache-first' | 'network-only';

export interface ProductQueryOptions {
  fetchPolicy?: ProductQueryFetchPolicy;
}

/**
 * Product Listing Service
 *
 * Handles product listing and fetching operations. Caller builds options
 * (e.g. via buildProductListOptions from product-list-filter.model).
 */
@Injectable({
  providedIn: 'root',
})
export class ProductListingService {
  private readonly apolloService = inject(ApolloService);
  private readonly mapper = inject(ProductMapperService);
  private readonly stateService = inject(ProductStateService);

  /**
   * Fetch products with the given list options (filter, sort, pagination).
   * @param options - ProductListOptions from buildProductListOptions or equivalent
   * @param queryOptions - Optional fetch policy; default cache-first for resilience; network-only after mutations
   */
  async fetchProducts(
    options?: ProductListOptions,
    queryOptions?: ProductQueryOptions,
  ): Promise<void> {
    const fetchPolicy = (queryOptions?.fetchPolicy ?? 'cache-first') as FetchPolicy;

    try {
      const client = this.apolloService.getClient();
      const result = await client.query({
        query: GET_PRODUCTS,
        variables: {
          options: options ?? DEFAULT_OPTIONS,
        },
        fetchPolicy,
      });

      const data = result.data as GetProductsQuery | undefined;
      this.applyResult(data?.products?.items ?? [], data?.products?.totalItems ?? 0);
    } catch (error: any) {
      this.handleError(error);
    }
  }

  /**
   * Fetch products matching an inventory alert filter.
   * Pagination and sorting are applied server-side so the full result set is returned.
   * @param filter - Inventory alert filter (LOW_STOCK, EXPIRING_SOON, EXPIRED)
   * @param options - ProductListOptions for pagination/sort
   * @param queryOptions - Optional fetch policy
   */
  async fetchProductsByInventoryAlert(
    filter: InventoryAlertFilter,
    options?: ProductListOptions,
    queryOptions?: ProductQueryOptions,
  ): Promise<void> {
    const fetchPolicy = (queryOptions?.fetchPolicy ?? 'cache-first') as FetchPolicy;

    try {
      const client = this.apolloService.getClient();
      const result = await client.query({
        query: GET_PRODUCTS_BY_INVENTORY_ALERT,
        variables: {
          filter,
          options: options ?? DEFAULT_OPTIONS,
        },
        fetchPolicy,
      });

      const data = result.data as GetProductsByInventoryAlertQuery | undefined;
      this.applyResult(
        (data?.productsByInventoryAlert?.items ?? []) as any[],
        data?.productsByInventoryAlert?.totalItems ?? 0,
      );
    } catch (error: any) {
      this.handleError(error);
    }
  }

  private applyResult(items: any[], total: number): void {
    this.stateService.setIsLoading(true);
    this.stateService.setError(null);

    const processedItems = items.map((product: any) => {
      const base = this.mapper.toProductSearchResult(product);
      return {
        ...product,
        ...base,
        variants:
          base.variants.map((v, i) => {
            const raw = product.variants?.[i];
            const kesPrice = raw?.prices?.find((p: any) => p.currencyCode === 'KES');
            const displayPrice = kesPrice ? extractCents(kesPrice.price) : v.priceWithTax;
            return {
              ...v,
              displayPrice,
              kesPrice: displayPrice,
              currencyCode: kesPrice?.currencyCode || 'KES',
            };
          }) || [],
      };
    });
    this.stateService.setProducts(processedItems);
    this.stateService.setTotalItems(total);
    this.stateService.setIsLoading(false);
  }

  private handleError(error: any): void {
    console.error('❌ Failed to fetch products:', error);
    this.stateService.setError(error.message || 'Failed to fetch products');
    this.stateService.setProducts([]);
    this.stateService.setTotalItems(0);
    this.stateService.setIsLoading(false);
  }
}
