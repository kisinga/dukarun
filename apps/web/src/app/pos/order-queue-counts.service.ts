import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { SupabaseService } from '../core/supabase.service';
import { LocationContextService } from '../core/location-context.service';
import { RecentSalesCacheService } from '../core/recent-sales-cache.service';

/**
 * Live counts for orders that still need action. These are exact database
 * counts rather than list lengths, so badges remain accurate above page caps.
 */
@Injectable({ providedIn: 'root' })
export class OrderQueueCountsService {
  private readonly supabase = inject(SupabaseService);
  private readonly locations = inject(LocationContextService);
  private readonly recentSales = inject(RecentSalesCacheService);

  readonly cashierQueue = signal(0);
  readonly proformas = signal(0);
  readonly total = computed(() => this.cashierQueue() + this.proformas());

  private get db() {
    return this.supabase.client;
  }

  constructor() {
    void this.refresh();
    effect(() => {
      this.recentSales.revision();
      untracked(() => void this.refresh());
    });
  }

  async refresh(): Promise<void> {
    try {
      // Keep the persisted status in sync before counting. The explicit expiry
      // predicate below also keeps the badge correct if the sweep itself fails.
      await this.db.rpc('expire_proformas');
      const now = new Date().toISOString();
      const locationId = this.locations.activeId();
      let cashierQuery = this.db
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending_payment');
      let proformaQuery = this.db
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'draft')
        .gt('expires_at', now);
      if (locationId) {
        cashierQuery = cashierQuery.eq('location_id', locationId);
        proformaQuery = proformaQuery.eq('location_id', locationId);
      }
      const [cashierQueue, proformas] = await Promise.all([cashierQuery, proformaQuery]);

      if (!cashierQueue.error) this.cashierQueue.set(cashierQueue.count ?? 0);
      if (!proformas.error) this.proformas.set(proformas.count ?? 0);
    } catch {
      // Offline or transient failure: keep the last counts; callers `void` this.
    }
  }
}
