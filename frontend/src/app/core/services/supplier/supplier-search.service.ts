import type { FetchPolicy } from '@apollo/client/core';
import { inject, Injectable } from '@angular/core';
import { GET_SUPPLIERS, GET_CUSTOMERS } from '../../graphql/operations.graphql';
import { formatPhoneNumber } from '../../utils/phone.utils';
import { AppCacheService } from '../cache/app-cache.service';
import { CacheSyncService } from '../cache/cache-sync.service';
import type { CacheSyncEntityHandler } from '../cache/cache-sync-handler.interface';
import { CompanyService } from '../company.service';
import { ApolloService } from '../apollo.service';
import { SupplierApiService } from './supplier-api.service';
import { SupplierStateService } from './supplier-state.service';

const SUPPLIERS_CACHE_KEY = 'suppliers_list';
const SUPPLIERS_TTL_MS = 24 * 60 * 60 * 1000; // 24h

interface SuppliersCachePayload {
  items: any[];
  lastSync?: number;
}

/** By-id cache entry for supplier (preview/detail). */
export interface SupplierCacheEntry {
  supplier: any;
  updatedAt: number;
}

export type SupplierQueryOptions = {
  fetchPolicy?: 'cache-first' | 'network-only';
};

/**
 * Supplier Search Service
 *
 * Handles supplier search and listing operations.
 * Manages supplier list state. Uses AppCacheService for offline-first (stale-while-revalidate).
 * Implements CacheSyncEntityHandler for 'supplier'; hydrateOne/invalidateOne invalidate list.
 */
@Injectable({
  providedIn: 'root',
})
export class SupplierSearchService implements CacheSyncEntityHandler {
  readonly entityType = 'supplier' as const;

  private readonly apolloService = inject(ApolloService);
  private readonly appCache = inject(AppCacheService);
  private readonly companyService = inject(CompanyService);
  private readonly apiService = inject(SupplierApiService);
  private readonly stateService = inject(SupplierStateService);
  private readonly cacheSyncService = inject(CacheSyncService);

  /** By-id cache for preview/detail; hydrated on fetch and on SSE. */
  private readonly suppliersById = new Map<string, SupplierCacheEntry>();

  constructor() {
    this.cacheSyncService.registerHandler(this);
  }

  /**
   * Fetch all suppliers with optional pagination.
   * Tries cache first (24h TTL); on hit hydrates state and revalidates in background.
   */
  async fetchSuppliers(options?: any, queryOptions?: SupplierQueryOptions): Promise<void> {
    this.stateService.setIsLoading(true);
    this.stateService.setError(null);

    const channelId = this.companyService.activeCompanyId();
    if (channelId) {
      const scope = `channel:${channelId}` as const;
      const stored = await this.appCache.getKV<SuppliersCachePayload>(scope, SUPPLIERS_CACHE_KEY);
      const now = Date.now();
      const valid =
        stored?.items && stored.lastSync != null && now - stored.lastSync < SUPPLIERS_TTL_MS;

      if (valid && stored.items.length >= 0) {
        this.stateService.setSuppliers(stored.items);
        this.stateService.setTotalItems(stored.items.length);
        this.stateService.setIsLoading(false);
        this.fetchSuppliersFromNetwork(options, scope).catch(() => {});
        return;
      }
    }

    try {
      await this.fetchSuppliersFromNetwork(
        options,
        channelId ? (`channel:${channelId}` as const) : undefined,
      );
    } finally {
      this.stateService.setIsLoading(false);
    }
  }

  private async fetchSuppliersFromNetwork(
    options?: any,
    scope?: `channel:${string}`,
  ): Promise<void> {
    const fetchPolicy = 'network-only' as FetchPolicy;
    try {
      const client = this.apolloService.getClient();
      const result = await client.query<any>({
        query: GET_SUPPLIERS,
        variables: {
          options: options || {
            take: 100,
            skip: 0,
          },
        },
        fetchPolicy,
      });

      const allItems = result.data?.customers?.items || [];
      const suppliersOnly = allItems.filter(
        (customer: any) => customer.customFields?.isSupplier === true,
      );

      this.stateService.setSuppliers(suppliersOnly);
      this.stateService.setTotalItems(suppliersOnly.length);

      if (scope) {
        await this.appCache.setKV(scope, SUPPLIERS_CACHE_KEY, {
          items: suppliersOnly,
          lastSync: Date.now(),
        });
      }
    } catch (error: any) {
      console.error('❌ Failed to fetch suppliers:', error);
      this.stateService.setError(error.message || 'Failed to fetch suppliers');
      this.stateService.setSuppliers([]);
      this.stateService.setTotalItems(0);
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

  /**
   * Get supplier by id from by-id cache (for preview/detail). Returns null if not cached.
   */
  getSupplierById(id: string): SupplierCacheEntry | null {
    return this.suppliersById.get(id) ?? null;
  }

  /**
   * Write supplier into by-id cache. Call after fetch from detail or preview.
   */
  hydrateSupplier(supplier: any): void {
    if (!supplier?.id) return;
    this.suppliersById.set(supplier.id, { supplier, updatedAt: Date.now() });
  }

  /** CacheSyncEntityHandler: fetch one supplier and update by-id cache; also invalidate list. */
  async hydrateOne(channelId: string, id: string): Promise<void> {
    try {
      const supplier = await this.apiService.getSupplierById(id);
      if (!supplier) return;
      this.hydrateSupplier(supplier);
    } catch (err) {
      console.warn('[SupplierSearch] hydrateOne failed', { channelId, id }, err);
    }
  }

  /**
   * Invalidate suppliers cache and clear list state for the given (or current) channel.
   * Called when the backend signals a customer/supplier change (e.g. via SSE).
   */
  async invalidateCache(channelId?: string): Promise<void> {
    console.log('[SupplierSearch] invalidateCache', { channelId });
    const id = channelId ?? this.companyService.activeCompanyId();
    if (!id) return;
    const scope = `channel:${id}` as const;
    await this.appCache.removeKV(scope, SUPPLIERS_CACHE_KEY);
    this.stateService.setSuppliers([]);
    this.stateService.setTotalItems(0);
  }

  /** CacheSyncEntityHandler: remove from by-id cache and invalidate list. */
  invalidateOne(channelId: string, id: string): void {
    this.suppliersById.delete(id);
    void this.invalidateCache(channelId);
  }
}
