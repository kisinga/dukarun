import { inject, Injectable } from '@angular/core';
import { extractCents } from '../../utils/data-extractors';
import { GET_PRODUCTS } from '../../graphql/operations.graphql';
import { ApolloService } from '../apollo.service';
import { ProductMapperService } from './product-mapper.service';
import { ProductStateService } from './product-state.service';

/**
 * Product Listing Service
 *
 * Handles product listing and fetching operations.
 * Manages product list state and processing.
 */
@Injectable({
  providedIn: 'root',
})
export class ProductListingService {
  private readonly apolloService = inject(ApolloService);
  private readonly mapper = inject(ProductMapperService);
  private readonly stateService = inject(ProductStateService);

  /**
   * Fetch all products with optional pagination
   * @param options - Optional pagination and filter options
   */
  async fetchProducts(options?: any): Promise<void> {
    this.stateService.setIsLoading(true);
    this.stateService.setError(null);

    try {
      const client = this.apolloService.getClient();
      const result = await client.query<any>({
        query: GET_PRODUCTS,
        variables: {
          options: options || {
            take: 50,
            skip: 0,
          },
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
