import { inject, Injectable } from '@angular/core';
import { GET_SUPPLIERS, GET_CUSTOMERS } from '../../graphql/operations.graphql';
import { formatPhoneNumber } from '../../utils/phone.utils';
import { ApolloService } from '../apollo.service';
import { SupplierStateService } from './supplier-state.service';

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
   * Fetch all suppliers with optional pagination
   * @param options - Optional pagination and filter options
   */
  async fetchSuppliers(options?: any): Promise<void> {
    this.stateService.setIsLoading(true);
    this.stateService.setError(null);

    try {
      const client = this.apolloService.getClient();

      const result = await client.query<any>({
        query: GET_SUPPLIERS,
        variables: {
          options: options || {
            take: 100, // Fetch more to account for filtering
            skip: 0,
          },
        },
        fetchPolicy: 'network-only',
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
   * @returns Customer/Supplier if found, null otherwise
   */
  async findSupplierByPhone(phone: string): Promise<any | null> {
    if (!phone || typeof phone !== 'string') {
      return null;
    }

    try {
      // Normalize phone number for consistent lookup
      const normalizedPhone = formatPhoneNumber(phone);

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
        fetchPolicy: 'network-only',
      });

      const items = result.data?.customers?.items || [];
      return items.length > 0 ? items[0] : null;
    } catch (error) {
      console.error('Failed to find supplier by phone:', error);
      return null;
    }
  }
}
