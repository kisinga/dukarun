import type { FetchPolicy } from '@apollo/client/core';
import { inject, Injectable } from '@angular/core';
import { GET_CUSTOMERS } from '../../graphql/operations.graphql';
import { AppCacheService } from '../cache/app-cache.service';
import { CacheSyncService } from '../cache/cache-sync.service';
import type { CacheSyncEntityHandler } from '../cache/cache-sync-handler.interface';
import { CompanyService } from '../company.service';
import { ApolloService } from '../apollo.service';
import { CustomerInput } from '../customer.service';
import { CustomerApiService } from './customer-api.service';
import { CustomerStateService } from './customer-state.service';
import { formatPhoneNumber } from '../../utils/phone.utils';

const CUSTOMERS_CACHE_KEY = 'customers_list';
const CUSTOMERS_TTL_MS = 24 * 60 * 60 * 1000; // 24h

interface CustomersCachePayload {
  items: any[];
  lastSync?: number;
}

/** Fetch policy for customer list/search; default cache-first for resilience; network-only after mutations. */
export interface CustomerQueryOptions {
  fetchPolicy?: 'cache-first' | 'network-only';
}

/**
 * Customer Search Service
 *
 * Handles customer search and listing operations.
 * Manages customer list state. Uses AppCacheService for offline-first (stale-while-revalidate).
 * Implements CacheSyncEntityHandler for 'customer'.
 */
@Injectable({
  providedIn: 'root',
})
export class CustomerSearchService implements CacheSyncEntityHandler {
  readonly entityType = 'customer' as const;

  private readonly apolloService = inject(ApolloService);
  private readonly appCache = inject(AppCacheService);
  private readonly companyService = inject(CompanyService);
  private readonly stateService = inject(CustomerStateService);
  private readonly apiService = inject(CustomerApiService);
  private readonly cacheSyncService = inject(CacheSyncService);

  constructor() {
    this.cacheSyncService.registerHandler(this);
  }

  /**
   * Fetch all customers with optional pagination.
   * Tries cache first (24h TTL); on hit hydrates state and revalidates in background.
   */
  async fetchCustomers(options?: any, queryOptions?: CustomerQueryOptions): Promise<void> {
    this.stateService.setIsLoading(true);
    this.stateService.setError(null);

    const channelId = this.companyService.activeCompanyId();
    if (channelId) {
      const scope = `channel:${channelId}` as const;
      const stored = await this.appCache.getKV<CustomersCachePayload>(scope, CUSTOMERS_CACHE_KEY);
      const now = Date.now();
      const valid =
        stored?.items && stored.lastSync != null && now - stored.lastSync < CUSTOMERS_TTL_MS;

      if (valid && stored.items.length >= 0) {
        this.stateService.setCustomers(stored.items);
        this.stateService.setTotalItems(stored.items.length);
        this.stateService.setIsLoading(false);
        this.fetchCustomersFromNetwork(options, scope).catch(() => {});
        return;
      }
    }

    try {
      await this.fetchCustomersFromNetwork(
        options,
        channelId ? (`channel:${channelId}` as const) : undefined,
      );
    } finally {
      this.stateService.setIsLoading(false);
    }
  }

  private async fetchCustomersFromNetwork(
    options?: any,
    scope?: `channel:${string}`,
  ): Promise<void> {
    const fetchPolicy = 'network-only' as FetchPolicy;
    try {
      const client = this.apolloService.getClient();
      const result = await client.query<any>({
        query: GET_CUSTOMERS,
        variables: {
          options: options || {
            take: 100,
            skip: 0,
          },
        },
        fetchPolicy,
      });

      const allItems = result.data?.customers?.items || [];
      const customersOnly = allItems.filter((customer: any) => !customer.customFields?.isSupplier);

      this.stateService.setCustomers(customersOnly);
      this.stateService.setTotalItems(customersOnly.length);

      if (scope) {
        await this.appCache.setKV(scope, CUSTOMERS_CACHE_KEY, {
          items: customersOnly,
          lastSync: Date.now(),
        });
      }
    } catch (error: any) {
      console.error('❌ Failed to fetch customers:', error);
      this.stateService.setError(error.message || 'Failed to fetch customers');
      this.stateService.setCustomers([]);
      this.stateService.setTotalItems(0);
    }
  }

  /**
   * Search for customers (excludes suppliers).
   * @param queryOptions - Optional fetch policy; default cache-first
   */
  async searchCustomers(
    term: string,
    take = 50,
    queryOptions?: CustomerQueryOptions,
  ): Promise<any[]> {
    const trimmed = term.trim();
    if (trimmed.length === 0) {
      return [];
    }

    const fetchPolicy = (queryOptions?.fetchPolicy ?? 'cache-first') as FetchPolicy;

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
        fetchPolicy,
      });

      const items = result.data?.customers?.items || [];
      return items.filter((customer: any) => !customer.customFields?.isSupplier);
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
        fetchPolicy: 'cache-first' as FetchPolicy,
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

  /**
   * Invalidate customers cache and clear list state for the given (or current) channel.
   * Called when the backend signals a customer change (e.g. via SSE).
   */
  async invalidateCache(channelId?: string): Promise<void> {
    console.log('[CustomerSearch] invalidateCache', { channelId });
    const id = channelId ?? this.companyService.activeCompanyId();
    if (!id) return;
    const scope = `channel:${id}` as const;
    await this.appCache.removeKV(scope, CUSTOMERS_CACHE_KEY);
    this.stateService.setCustomers([]);
    this.stateService.setTotalItems(0);
  }

  /** CacheSyncEntityHandler: list-only; invalidate so next read refetches. */
  invalidateOne(channelId: string, _id: string): void {
    void this.invalidateCache(channelId);
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
