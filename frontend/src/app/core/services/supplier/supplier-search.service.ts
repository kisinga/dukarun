import type { FetchPolicy } from '@apollo/client/core';
import { inject, Injectable } from '@angular/core';
import { GET_SUPPLIERS, GET_CUSTOMERS } from '../../graphql/operations.graphql';
import { formatPhoneNumber } from '../../utils/phone.utils';
import { ApolloService } from '../apollo.service';
import { SupplierStateService } from './supplier-state.service';

export type SupplierQueryOptions = {
  fetchPolicy?: 'cache-first' | 'network-only';
};

/**
 * Supplier Search Service
 *
 * Handles supplier search and listing operations.
 * Manages supplier list state.
 */
@Injectable({
  providedIn: 'root',
})
export class SupplierSearchService {
  private readonly apolloService = inject(ApolloService);
  private readonly stateService = inject(SupplierStateService);

  /**
   * Fetch all suppliers with optional pagination.
   * @param queryOptions - Optional fetch policy (default cache-first; use network-only after mutations)
   */
  async fetchSuppliers(options?: any, queryOptions?: SupplierQueryOptions): Promise<void> {
    this.stateService.setIsLoading(true);
    this.stateService.setError(null);

    try {
      const client = this.apolloService.getClient();
      const fetchPolicy = (queryOptions?.fetchPolicy ?? 'cache-first') as FetchPolicy;

      const result = await client.query<any>({
        query: GET_SUPPLIERS,
        variables: {
          options: options || {
            take: 100, // Fetch more to account for filtering
            skip: 0,
          },
        },
        fetchPolicy,
      });

      const allItems = result.data?.customers?.items || [];
      const allTotal = result.data?.customers?.totalItems || 0;

      // Filter to only get suppliers (customers with isSupplier = true) on frontend
      const suppliersOnly = allItems.filter(
        (customer: any) => customer.customFields?.isSupplier === true,
      );

      this.stateService.setSuppliers(suppliersOnly);
      this.stateService.setTotalItems(suppliersOnly.length);
    } catch (error: any) {
      console.error('❌ Failed to fetch suppliers:', error);
      this.stateService.setError(error.message || 'Failed to fetch suppliers');
      this.stateService.setSuppliers([]);
      this.stateService.setTotalItems(0);
    } finally {
      this.stateService.setIsLoading(false);
    }
  }

  /**
   * Find a supplier (or customer) by phone number
   *
   * @param phone - Phone number (will be normalized)
   * @param queryOptions - Optional fetch policy (default cache-first)
   * @returns Customer/Supplier if found, null otherwise
   */
  async findSupplierByPhone(
    phone: string,
    queryOptions?: SupplierQueryOptions,
  ): Promise<any | null> {
    if (!phone || typeof phone !== 'string') {
      return null;
    }

    try {
      // Normalize phone number for consistent lookup
      const normalizedPhone = formatPhoneNumber(phone);
      const fetchPolicy = (queryOptions?.fetchPolicy ?? 'cache-first') as FetchPolicy;

      const client = this.apolloService.getClient();
      const result = await client.query<any>({
        query: GET_CUSTOMERS,
        variables: {
          options: {
            take: 1,
            skip: 0,
            filter: {
              phoneNumber: { eq: normalizedPhone },
            },
          },
        },
        fetchPolicy,
      });

      const items = result.data?.customers?.items || [];
      return items.length > 0 ? items[0] : null;
    } catch (error) {
      console.error('Failed to find supplier by phone:', error);
      return null;
    }
  }
}
