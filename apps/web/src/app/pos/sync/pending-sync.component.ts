import { Component, inject, signal, viewChild } from '@angular/core';
import { PageLayoutComponent } from '../../shared/ui/page-layout.component';
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
    PageLayoutComponent,
    EmptyStateComponent,
    StatusBadgeComponent,
    DeleteConfirmationModalComponent,
  ],
  template: `
    <app-page
      title="Pending Sync"
      [badge]="sync.entries().length"
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

      @if (notice()) {
        <p class="mb-2 text-sm text-success">{{ notice() }}</p>
      }
      @if (error()) {
        <p class="mb-2 text-sm text-error">{{ error() }}</p>
      }

      @if (sync.legacyEntryCount() > 0) {
        <div role="alert" class="alert alert-warning mb-3 text-sm">
          <span>
            {{ sync.legacyEntryCount() }} sale(s) from an older app version remain safely on this
            device. They are quarantined because their company could not be verified and will not
            sync automatically.
          </span>
        </div>
      }

      @if (sync.entries().length === 0) {
        <app-empty-state
          icon="heroCheckCircle"
          [title]="
            sync.legacyEntryCount() > 0 ? 'Nothing waiting for this account' : 'Nothing waiting'
          "
          [description]="
            sync.legacyEntryCount() > 0
              ? 'Older quarantined sales need manual recovery before they can be posted.'
              : 'All sales are synced.'
          "
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
                    <button
                      class="btn btn-outline btn-sm"
                      [disabled]="retrying() === entry.client_ref"
                      (click)="retry(entry.client_ref)"
                    >
                      {{ retrying() === entry.client_ref ? 'Retrying…' : 'Retry' }}
                    </button>
                    <button class="btn btn-error btn-outline btn-sm" (click)="startDiscard(entry)">
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
      <app-delete-confirmation-modal
        [data]="discardData()"
        title="Discard queued sale?"
        entityType="sale"
        verb="discard"
        confirmButtonText="Discard"
        (confirm)="confirmDiscard()"
      />
    </app-page>
  `,
})
export class PendingSyncComponent {
  protected readonly sync = inject(SyncService);
  protected readonly connectivity = inject(ConnectivityService);

  protected readonly fmt = formatKes;
  protected readonly discarding = signal<OutboxEntry | null>(null);
  private readonly deleteModal = viewChild(DeleteConfirmationModalComponent);
  protected readonly notice = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly retrying = signal<string | null>(null);

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
    const failedBefore = this.sync.failedCount();
    await this.sync.sync();
    // Rejected entries flip queued→failed without leaving the outbox; don't
    // report them as synced.
    const posted = before - this.sync.queuedCount() - (this.sync.failedCount() - failedBefore);
    if (posted > 0) this.notice.set(`Synced ${posted} sale(s)`);
  }

  protected async retry(clientRef: string): Promise<void> {
    this.discarding.set(null);
    this.error.set(null);
    this.retrying.set(clientRef);
    try {
      await this.sync.retry(clientRef);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      this.retrying.set(null);
    }
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
