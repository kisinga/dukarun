import { inject, Injectable } from '@angular/core';
import type { ProductListOptions } from '../../graphql/generated/graphql';
import { extractCents } from '../../utils/data-extractors';
import { GET_PRODUCTS } from '../../graphql/operations.graphql';
import { ApolloService } from '../apollo.service';
import { ProductMapperService } from './product-mapper.service';
import { ProductStateService } from './product-state.service';

const DEFAULT_OPTIONS: ProductListOptions = { take: 50, skip: 0 };

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
   */
  async fetchProducts(options?: ProductListOptions): Promise<void> {
    this.stateService.setIsLoading(true);
    this.stateService.setError(null);

    try {
      const client = this.apolloService.getClient();
      const result = await client.query<{ products: { items: any[]; totalItems: number } }>({
        query: GET_PRODUCTS,
        variables: {
          options: options ?? DEFAULT_OPTIONS,
        },
        fetchPolicy: 'network-only',
      });

      const items = result.data?.products?.items || [];
      const total = result.data?.products?.totalItems || 0;

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
    } catch (error: any) {
      console.error('❌ Failed to fetch products:', error);
      this.stateService.setError(error.message || 'Failed to fetch products');
      this.stateService.setProducts([]);
      this.stateService.setTotalItems(0);
    } finally {
      this.stateService.setIsLoading(false);
    }
  }
}
