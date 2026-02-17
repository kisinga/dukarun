import { Injectable, inject } from '@angular/core';
import { AppCacheService } from './cache/app-cache.service';
import { CacheSyncService } from './cache/cache-sync.service';
import type { CacheSyncEntityHandler } from './cache/cache-sync-handler.interface';
import { CompanyService } from './company.service';
import { GET_PAYMENT_METHODS } from '../graphql/operations.graphql';
import { ApolloService } from './apollo.service';

const PAYMENT_METHODS_CACHE_KEY = 'payment_methods';
const PAYMENT_METHODS_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export interface PaymentMethod {
  id: string;
  code: string;
  name: string;
  description: string;
  enabled: boolean;
  customFields?: {
    imageAsset?: {
      id: string;
      source: string;
      name: string;
      preview: string;
    };
    isActive?: boolean;
  };
}

interface PaymentMethodsCachePayload {
  items: PaymentMethod[];
  lastSync?: number;
}

/**
 * Payment Method Service
 *
 * Handles fetching and managing payment methods for the current channel.
 * Uses AppCacheService for offline-first; 24h TTL.
 * Implements CacheSyncEntityHandler: list-only cache, hydrateOne/invalidateOne invalidate list.
 */
@Injectable({ providedIn: 'root' })
export class PaymentMethodService implements CacheSyncEntityHandler {
  readonly entityType = 'payment_method' as const;

  private readonly apolloService = inject(ApolloService);
  private readonly appCache = inject(AppCacheService);
  private readonly companyService = inject(CompanyService);
  private readonly cacheSyncService = inject(CacheSyncService);

  constructor() {
    this.cacheSyncService.registerHandler(this);
  }

  /**
   * Fetch all available payment methods for the current channel.
   * Uses cache first (24h TTL), then network.
   */
  async getPaymentMethods(): Promise<PaymentMethod[]> {
    const channelId = this.companyService.activeCompanyId();
    if (channelId) {
      const scope = `channel:${channelId}` as const;
      const payload = await this.appCache.getKV<PaymentMethodsCachePayload>(
        scope,
        PAYMENT_METHODS_CACHE_KEY,
      );
      const now = Date.now();
      const valid =
        payload?.items?.length &&
        payload.lastSync != null &&
        now - payload.lastSync < PAYMENT_METHODS_TTL_MS;
      if (valid && payload.items.length > 0) {
        return payload.items;
      }
    }

    try {
      const client = this.apolloService.getClient();
      const result = await client.query({
        query: GET_PAYMENT_METHODS,
        fetchPolicy: 'network-only',
      });

      if (result.data?.paymentMethods?.items) {
        const methods = result.data.paymentMethods.items as PaymentMethod[];

        if (methods.length === 0) {
          throw new Error(
            'No payment methods are configured. Please configure payment methods in the admin panel.',
          );
        }

        if (channelId) {
          const scope = `channel:${channelId}` as const;
          await this.appCache.setKV(scope, PAYMENT_METHODS_CACHE_KEY, {
            items: methods,
            lastSync: Date.now(),
          });
        }

        return methods;
      }

      throw new Error('Failed to fetch payment methods from the server.');
    } catch (error) {
      console.error('Failed to fetch payment methods:', error);
      throw error;
    }
  }

  /**
   * Invalidate payment methods cache for the given or current channel.
   * Next getPaymentMethods() will refetch from network.
   */
  async invalidateCache(channelId?: string): Promise<void> {
    const id = channelId ?? this.companyService.activeCompanyId();
    if (id) {
      const scope = `channel:${id}` as const;
      await this.appCache.removeKV(scope, PAYMENT_METHODS_CACHE_KEY);
    }
  }

  /** CacheSyncEntityHandler: list-only; invalidate so next read refetches. */
  invalidateOne(channelId: string, _id: string): void {
    void this.invalidateCache(channelId);
  }
}
