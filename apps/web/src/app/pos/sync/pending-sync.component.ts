import { Component, inject, signal, viewChild } from '@angular/core';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { DeleteConfirmationModalComponent } from '../../shared/ui/delete-confirmation-modal.component';
import { formatKes } from '../../core/money';
import { ConnectivityService } from '../offline/connectivity.service';
import type { OutboxEntry } from '../offline/offline-db';
import { SyncService } from '../offline/sync.service';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

/**
 * Pending sync — the offline outbox. Queued sales are local-only until the
 * sync engine replays them (exactly-once via client_ref); they never appear
 * in Today's Sales before that. Failed entries (server P0001 rejections)
 * keep the server message and need explicit user action.
 */
@Component({
  selector: 'app-pending-sync',
  imports: [
    PageHeaderComponent,
    EmptyStateComponent,
    StatusBadgeComponent,
    DeleteConfirmationModalComponent,
  ],
  template: `
    <main class="dashboard-main min-h-screen bg-base-200 p-4">
      <div class="mx-auto max-w-4xl">
        <app-page-header
          title="Pending Sync"
          backLink="/dashboard"
          backLabel="Dashboard"
          subtitle="Posted when you're back online. Until then they're only on this device — not in Today's Sales, not in the books."
        >
          @if (!connectivity.online()) {
            <span actions class="badge badge-warning">Offline</span>
          }
          <button
            actions
            class="btn btn-primary btn-sm ml-auto"
            [disabled]="!connectivity.online() || sync.syncing() || sync.queuedCount() === 0"
            (click)="syncNow()"
          >
            {{ sync.syncing() ? 'Syncing…' : 'Sync now' }}
          </button>
        </app-page-header>

        @if (notice()) {
          <p class="mb-2 text-sm text-success">{{ notice() }}</p>
        }

        @if (sync.entries().length === 0) {
          <app-empty-state
            icon="heroCheckCircle"
            title="Nothing waiting"
            description="All sales are synced."
          />
        } @else {
          <div class="flex flex-col gap-2">
            @for (entry of sync.entries(); track entry.client_ref) {
              <div
                class="card bg-base-100"
                [class.border]="entry.status === 'failed'"
                [class.border-error]="entry.status === 'failed'"
              >
                <div class="card-body p-4">
                  <div class="flex flex-wrap items-center gap-3">
                    <span class="font-mono text-sm">{{ shortRef(entry.client_ref) }}</span>
                    <span class="text-sm text-base-content/60">
                      queued {{ time(entry.queued_at) }}
                    </span>
                    <span class="text-sm">{{ entry.lines.length }} item(s)</span>
                    <app-status-badge
                      [type]="entry.status === 'failed' ? 'error' : 'warning'"
                      [label]="entry.status === 'failed' ? 'failed' : 'awaiting sync'"
                    />
                    <span class="ml-auto font-bold tabular-nums">{{ fmt(total(entry)) }}</span>
                    @if (entry.status === 'failed') {
                      <button class="btn btn-outline btn-sm" (click)="retry(entry.client_ref)">
                        Retry
                      </button>
                      <button
                        class="btn btn-error btn-outline btn-sm"
                        (click)="startDiscard(entry)"
                      >
                        Discard
                      </button>
                    }
                  </div>
                  @if (entry.status === 'failed' && entry.error) {
                    <p class="mt-2 text-sm text-error">{{ entry.error }}</p>
                    <p class="text-xs text-base-content/60">
                      The server rejected this sale — it was never posted. Retry after fixing the
                      cause (e.g. stock), or discard it.
                    </p>
                  }
                </div>
              </div>
            }
          </div>
        }
      </div>

      <app-delete-confirmation-modal
        [data]="discardData()"
        title="Discard queued sale?"
        entityType="sale"
        verb="discard"
        confirmButtonText="Discard"
        (confirm)="confirmDiscard()"
      />
    </main>
  `,
})
export class PendingSyncComponent {
  protected readonly sync = inject(SyncService);
  protected readonly connectivity = inject(ConnectivityService);

  protected readonly fmt = formatKes;
  protected readonly discarding = signal<OutboxEntry | null>(null);
  private readonly deleteModal = viewChild(DeleteConfirmationModalComponent);
  protected readonly notice = signal<string | null>(null);

  protected total(entry: OutboxEntry): number {
    return entry.lines.reduce(
      (sum, l) => sum + Math.round(l.quantity * (l.custom_price ?? l.unit_price)),
      0
    );
  }

  protected shortRef(ref: string): string {
    return ref.slice(0, 8);
  }

  protected time(iso: string): string {
    return new Date(iso).toLocaleString('en-KE', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  protected async syncNow(): Promise<void> {
    this.notice.set(null);
    const before = this.sync.queuedCount();
    await this.sync.sync();
    const posted = before - this.sync.queuedCount();
    if (posted > 0) this.notice.set(`Synced ${posted} sale(s)`);
  }

  protected async retry(clientRef: string): Promise<void> {
    this.discarding.set(null);
    await this.sync.retry(clientRef);
  }

  protected startDiscard(entry: OutboxEntry): void {
    this.discarding.set(entry);
    this.deleteModal()?.show();
  }

  protected discardData() {
    const entry = this.discarding();
    return {
      entityName: entry
        ? `${this.shortRef(entry.client_ref)} · ${this.fmt(this.total(entry))}`
        : '',
      warningDetails: ['This sale was never posted to the server.'],
    };
  }

  protected async confirmDiscard(): Promise<void> {
    const entry = this.discarding();
    if (!entry) return;
    this.discarding.set(null);
    this.deleteModal()?.hide();
    await this.sync.discard(entry.client_ref);
  }
}
