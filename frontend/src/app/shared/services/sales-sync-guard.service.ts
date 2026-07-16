import { Injectable, signal } from '@angular/core';

/**
 * Guards how many sales can be completed before a sync is required.
 * After a successful product cache sync, the counter resets. This limits
 * how far the app can go with cached data before requiring a server sync.
 */
@Injectable({
  providedIn: 'root',
})
export class SalesSyncGuardService {
  /** Max sales allowed before requiring a sync (configurable for testing) */
  readonly maxSalesBeforeSync = 3;

  private readonly salesSinceLastSyncSignal = signal(0);

  readonly salesSinceLastSync = this.salesSinceLastSyncSignal.asReadonly();

  /** True if the user can complete another sale; false when sync is required. */
  canSell(): boolean {
    return this.salesSinceLastSyncSignal() < this.maxSalesBeforeSync;
  }

  /** Call when a sale is successfully created (order created on server). */
  recordSale(): void {
    this.salesSinceLastSyncSignal.update((n) => n + 1);
  }

  /** Call when a sync has completed (e.g. product cache prefetch from network). */
  markSynced(): void {
    this.salesSinceLastSyncSignal.set(0);
  }

  /** Remaining sales allowed before sync is required (0 = must sync). */
  remainingSalesBeforeSync(): number {
    return Math.max(0, this.maxSalesBeforeSync - this.salesSinceLastSyncSignal());
  }
}
