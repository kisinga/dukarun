import { inject, Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import type { GetOrderFullQuery, GetOrderFullQueryVariables } from '../graphql/generated/graphql';
import { GetOrderFullDocument } from '../graphql/generated/graphql';
import { CacheSyncService } from './cache/cache-sync.service';
import type { CacheSyncEntityHandler } from './cache/cache-sync-handler.interface';
import { CompanyService } from './company.service';
import { ApolloService } from './apollo.service';

/** By-id cache entry for order (preview/detail). */
export interface OrderCacheEntry {
  order: any;
  updatedAt: number;
}

/**
 * In-memory by-id order cache. Hydrated on fetch (detail/preview) and on SSE.
 * Registers as the single CacheSyncEntityHandler for 'order'; on invalidateOne
 * emits orderInvalidated$ so dashboard can refetch recent orders.
 */
@Injectable({
  providedIn: 'root',
})
export class OrderCacheService implements CacheSyncEntityHandler {
  readonly entityType = 'order' as const;

  private readonly apolloService = inject(ApolloService);
  private readonly companyService = inject(CompanyService);
  private readonly cacheSyncService = inject(CacheSyncService);

  private readonly invalidatedSubject = new Subject<void>();
  /** Emit when any order is invalidated (e.g. deleted); dashboard subscribes to refetch recent orders. */
  readonly orderInvalidated$ = this.invalidatedSubject.asObservable();

  private readonly ordersById = new Map<string, OrderCacheEntry>();

  constructor() {
    this.cacheSyncService.registerHandler(this);
  }

  getOrderById(id: string): OrderCacheEntry | null {
    return this.ordersById.get(id) ?? null;
  }

  hydrateOrder(order: any): void {
    if (!order?.id) return;
    this.ordersById.set(order.id, { order, updatedAt: Date.now() });
  }

  async hydrateOne(channelId: string, id: string): Promise<void> {
    if (this.companyService.activeCompanyId() !== channelId) return;
    try {
      const client = this.apolloService.getClient();
      const result = await client.query<GetOrderFullQuery, GetOrderFullQueryVariables>({
        query: GetOrderFullDocument,
        variables: { id },
        fetchPolicy: 'network-only',
      });
      const order = result.data?.order ?? null;
      if (!order) return;
      this.hydrateOrder(order);
    } catch (err) {
      console.warn('[OrderCache] hydrateOne failed', { channelId, id }, err);
    }
  }

  invalidateOne(channelId: string, id: string): void {
    this.ordersById.delete(id);
    if (this.companyService.activeCompanyId() === channelId) {
      this.invalidatedSubject.next();
    }
  }
}
