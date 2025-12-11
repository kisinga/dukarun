import { inject, Injectable } from '@angular/core';
import { GET_CUSTOMERS } from '../../graphql/operations.graphql';
import { ApolloService } from '../apollo.service';
import { CustomerInput } from '../customer.service';
import { CustomerApiService } from './customer-api.service';
import { CustomerStateService } from './customer-state.service';
import { formatPhoneNumber } from '../../utils/phone.utils';

/**
 * Customer Search Service
 *
 * Handles customer search and listing operations.
 * Manages customer list state.
 */
@Injectable({
  providedIn: 'root',
})
export class CustomerSearchService {
  private readonly apolloService = inject(ApolloService);
  private readonly stateService = inject(CustomerStateService);
  private readonly apiService = inject(CustomerApiService);

  /**
   * Fetch all customers with optional pagination
   * @param options - Optional pagination and filter options
   */
  async fetchCustomers(options?: any): Promise<void> {
    this.stateService.setIsLoading(true);
    this.stateService.setError(null);

    try {
      const client = this.apolloService.getClient();

      const result = await client.query<any>({
        query: GET_CUSTOMERS,
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

      // Filter out suppliers (customers with isSupplier = true) on frontend
      const customersOnly = allItems.filter((customer: any) => !customer.customFields?.isSupplier);

      this.stateService.setCustomers(customersOnly);
      this.stateService.setTotalItems(customersOnly.length);
    } catch (error: any) {
      console.error('❌ Failed to fetch customers:', error);
      this.stateService.setError(error.message || 'Failed to fetch customers');
      this.stateService.setCustomers([]);
      this.stateService.setTotalItems(0);
    } finally {
      this.stateService.setIsLoading(false);
    }
  }

  /**
   * Search for customers (including suppliers)
   */
  async searchCustomers(term: string, take = 50): Promise<any[]> {
    const trimmed = term.trim();
    if (trimmed.length === 0) {
      return [];
    }

    try {
      const client = this.apolloService.getClient();
      const result = await client.query<any>({
        query: GET_CUSTOMERS,
        variables: {
          options: {
            take,
            skip: 0,
            filter: {
              firstName: { contains: trimmed },
            },
          },
        },
        fetchPolicy: 'network-only',
      });

      return result.data?.customers?.items || [];
    } catch (error) {
      console.error('Failed to search customers:', error);
      return [];
    }
  }

  /**
   * Find a customer by phone number
   *
   * @param phone - Phone number (will be normalized)
   * @returns Customer if found, null otherwise
   */
  async findCustomerByPhone(phone: string): Promise<any | null> {
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
      console.error('Failed to find customer by phone:', error);
      return null;
    }
  }

  /**
   * Quickly create a customer record for checkout flows.
   *
   * Checks for existing customer by phone number first to prevent duplicates.
   * If no email is provided, generates one from the phone number.
   */
  async quickCreateCustomer(input: {
    name: string;
    phone: string;
    email?: string;
  }): Promise<string | null> {
    // Normalize phone number
    const normalizedPhone = formatPhoneNumber(input.phone);

    // Check if customer with this phone number already exists
    const existingCustomer = await this.findCustomerByPhone(normalizedPhone);
    if (existingCustomer) {
      console.log('✅ Found existing customer by phone:', existingCustomer.id);
      return existingCustomer.id;
    }

    // Use provided email or empty string (let backend generate sentinel)
    const emailAddress = input.email?.trim() || '';

    const { firstName, lastName } = this.splitName(input.name);
    return this.apiService.createCustomer({
      firstName,
      lastName,
      emailAddress,
      phoneNumber: normalizedPhone,
    });
  }

  private splitName(name: string): { firstName: string; lastName: string } {
    const trimmed = name.trim();
    if (!trimmed.includes(' ')) {
      return { firstName: trimmed, lastName: 'POS' };
    }

    const [firstName, ...rest] = trimmed.split(' ');
    return {
      firstName,
      lastName: rest.join(' ') || 'POS',
    };
  }
}
