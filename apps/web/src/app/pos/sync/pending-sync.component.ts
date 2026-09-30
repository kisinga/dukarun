import { Component, computed, inject, signal } from '@angular/core';
import { PageLayoutComponent } from '../../shared/ui/page-layout.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { formatKes } from '../../core/money';
import { ConnectivityService } from '../offline/connectivity.service';
import { SyncService } from '../offline/sync.service';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { MobileListComponent } from '../../shared/ui/mobile-list.component';
import { PageActionsComponent } from '../../shared/ui/page-actions.component';
import { OfflineSaleReviewComponent } from './offline-sale-review.component';
import { offlineBlockerLabel } from '../offline/offline-contract';

@Component({
  selector: 'app-pending-sync',
  imports: [
    PageLayoutComponent,
    EmptyStateComponent,
    StatusBadgeComponent,
    MobileListComponent,
    PageActionsComponent,
    OfflineSaleReviewComponent,
  ],
  template: `
    <app-page
      title="Pending sales"
      [badge]="rows().length"
      subtitle="Queued and held sales are not posted until the server confirms completion."
    >
      <app-page-actions actions>
        <button
          primaryAction
          class="btn btn-primary btn-sm"
          [disabled]="!connectivity.online() || sync.syncing()"
          (click)="syncNow()"
        >
          {{ sync.syncing() ? 'Checking…' : 'Sync and refresh' }}
        </button>
      </app-page-actions>
      @if (notice()) {
        <p role="status" class="mb-3 text-sm text-success">{{ notice() }}</p>
      }
      @if (error()) {
        <p role="alert" class="mb-3 text-sm text-error">{{ error() }}</p>
      }
      @if (reviewId(); as id) {
        <app-offline-sale-review
          [reviewId]="id"
          (closed)="reviewId.set(null)"
          (resolved)="reviewResolved()"
        />
      } @else if (!rows().length) {
        <app-empty-state
          icon="heroCheckCircle"
          title="Nothing waiting"
          description="No queued or held sales for this account."
        />
      } @else {
        <app-mobile-list [desktopVisible]="true">
          @for (row of rows(); track row.clientRef) {
            <div mobileListRow class="bg-base-100 p-4">
              <div class="flex flex-wrap items-center gap-3">
                <strong class="font-mono text-sm">{{ row.clientRef.slice(0, 8) }}</strong>
                <span class="text-sm text-base-content/60"
                  >Captured {{ time(row.capturedAt) }}</span
                >
                <app-status-badge
                  [type]="row.status === 'failed' ? 'error' : 'warning'"
                  [label]="row.status === 'queued' ? 'Awaiting sync' : row.status"
                />
                <strong class="ml-auto tabular-nums">{{ fmt(row.paid) }} collected</strong>
                @if (row.reviewId) {
                  <button
                    class="btn btn-outline btn-sm"
                    [disabled]="!connectivity.online()"
                    (click)="reviewId.set(row.reviewId)"
                  >
                    Review sale
                  </button>
                } @else if (row.status === 'failed') {
                  <button
                    class="btn btn-outline btn-sm"
                    [disabled]="!connectivity.online() || sync.syncing()"
                    (click)="retry(row.clientRef)"
                  >
                    Retry original request
                  </button>
                }
              </div>
              <p class="mt-2 text-xs text-base-content/60">
                {{
                  row.reviewId
                    ? 'Saved by the server · remains unresolved'
                    : 'Saved on this device · keep the app data until sync confirms receipt'
                }}
              </p>
              @if (row.error) {
                <p class="mt-2 text-sm text-warning">{{ row.error }}</p>
              }
            </div>
          }
        </app-mobile-list>
      }
    </app-page>
  `,
})
export class PendingSyncComponent {
  protected readonly sync = inject(SyncService);
  protected readonly connectivity = inject(ConnectivityService);
  protected readonly fmt = formatKes;
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly reviewId = signal<string | null>(null);
  protected readonly rows = computed(() => {
    const local = this.sync.entries().map(entry => ({
      clientRef: entry.client_ref,
      capturedAt: entry.occurred_at,
      status: entry.status,
      paid: entry.payments.filter(p => p.method !== 'credit').reduce((sum, p) => sum + p.amount, 0),
      reviewId: entry.outcome?.review_id ?? null,
      error: entry.error ?? '',
    }));
    const refs = new Set(local.map(row => row.clientRef));
    return [
      ...local,
      ...this.sync
        .reviews()
        .filter(r => !refs.has(r.client_ref))
        .map(r => ({
          clientRef: r.client_ref,
          capturedAt: r.captured_at,
          status: r.status,
          paid: r.payments.filter(p => p.method !== 'credit').reduce((sum, p) => sum + p.amount, 0),
          reviewId: r.id,
          error: r.blockers.map(offlineBlockerLabel).join('. '),
        })),
    ].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  });
  protected time(iso: string) {
    return new Date(iso).toLocaleString('en-KE');
  }
  protected async syncNow() {
    this.notice.set('');
    this.error.set('');
    try {
      await this.sync.sync();
      const count = this.sync.lastPostedCount();
      this.notice.set(
        count ? `Posted ${count} sale(s).` : 'Status refreshed. Held sales still need review.'
      );
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not sync. Requests are kept.');
    }
  }
  protected async retry(ref: string) {
    this.error.set('');
    try {
      await this.sync.retry(ref);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not retry');
    }
  }
  protected async reviewResolved() {
    this.reviewId.set(null);
    await this.syncNow();
  }
}
