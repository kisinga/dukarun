import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { PosRpcError, PosService, Variant } from '../pos.service';
import { ConnectivityService } from './connectivity.service';
import { OutboxEntry, ProductSnapshot, offlineDb } from './offline-db';

const SYNC_INTERVAL_MS = 30_000;

/**
 * Offline sales outbox + sync engine.
 *
 * Honesty rules (do not break these):
 *  - Queued sales are NOT server truth: they never appear in Today's Sales,
 *    only in the "Pending sync" list, and the user is told "queued", never
 *    "completed".
 *  - Replay is FIFO via post_sale(p_client_ref) — exactly-once by design, so
 *    a sale whose response was lost is safe to replay.
 *  - Network failure mid-sync: stop, keep everything queued, retry later.
 *  - Server rejection (P0001): mark the entry failed with the server message
 *    and leave it for explicit user action (retry / discard). Never silently
 *    drop, never infinite-retry.
 *
 * Triggers: browser `online` (via ConnectivityService), app start, manual
 * "Sync now", and a periodic attempt every 30s while online.
 */
@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly pos = inject(PosService);
  private readonly connectivity = inject(ConnectivityService);

  /** All outbox entries (queued + failed), FIFO by queued_at. */
  readonly entries = signal<OutboxEntry[]>([]);
  readonly queuedCount = computed(() => this.entries().filter(e => e.status === 'queued').length);
  readonly failedCount = computed(() => this.entries().filter(e => e.status === 'failed').length);
  readonly syncing = signal(false);
  /** Bumped after a sync pass that posted at least one sale — screens can refresh. */
  readonly lastPostedAt = signal<string | null>(null);

  constructor() {
    void this.refresh();
    // App start + reconnect triggers.
    effect(() => {
      if (this.connectivity.online()) void this.sync();
    });
    // Periodic retry while online.
    if (typeof setInterval !== 'undefined') {
      setInterval(() => {
        if (this.connectivity.online() && !this.syncing()) void this.sync();
      }, SYNC_INTERVAL_MS);
    }
  }

  /** Persist a locally-completed sale and surface it in the queue. */
  async enqueue(entry: Omit<OutboxEntry, 'client_ref' | 'queued_at' | 'status'>): Promise<string> {
    const full: OutboxEntry = {
      ...entry,
      client_ref: crypto.randomUUID(),
      queued_at: new Date().toISOString(),
      status: 'queued',
    };
    const db = await offlineDb();
    await db.put('outbox', full);
    await this.refresh();
    return full.client_ref;
  }

  /** Manual "Sync now" + all automatic triggers funnel here. */
  async sync(): Promise<void> {
    if (this.syncing() || !this.connectivity.online()) return;
    this.syncing.set(true);
    let posted = 0;
    try {
      const db = await offlineDb();
      const queued = (await db.getAllFromIndex('outbox', 'by-queued-at')).filter(
        e => e.status === 'queued'
      );
      for (const entry of queued) {
        try {
          await this.pos.postSale(
            entry.customer_id,
            entry.lines,
            entry.payments,
            false,
            entry.client_ref
          );
          await db.delete('outbox', entry.client_ref);
          posted++;
        } catch (err) {
          if (err instanceof PosRpcError && err.code === 'P0001') {
            // Business rejection (insufficient_stock, payment_mismatch, …):
            // park it as failed; user action required. Keep replaying the rest.
            await db.put('outbox', { ...entry, status: 'failed', error: err.message });
          } else {
            // Network/unknown failure: stop and retry later — the entry stays
            // queued and replay is exactly-once thanks to client_ref.
            break;
          }
        }
      }
      if (posted > 0) this.lastPostedAt.set(new Date().toISOString());
    } finally {
      this.syncing.set(false);
      await this.refresh();
    }
  }

  /** User chose to retry a failed sale (re-queues it for the next sync pass). */
  async retry(clientRef: string): Promise<void> {
    const db = await offlineDb();
    const entry = await db.get('outbox', clientRef);
    if (!entry) return;
    await db.put('outbox', { ...entry, status: 'queued', error: undefined });
    await this.refresh();
    void this.sync();
  }

  /** User explicitly discarded a failed sale (UI confirms first). */
  async discard(clientRef: string): Promise<void> {
    const db = await offlineDb();
    await db.delete('outbox', clientRef);
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const db = await offlineDb();
    this.entries.set(await db.getAllFromIndex('outbox', 'by-queued-at'));
  }

  // --- Product snapshot (offline search on the Sell screen) ---

  /** Cache the active catalog in IndexedDB. Fire-and-forget when online. */
  async refreshProductSnapshot(): Promise<void> {
    if (!this.connectivity.online()) return;
    try {
      const products = await this.pos.fetchActiveVariants();
      const db = await offlineDb();
      const snapshot: ProductSnapshot = {
        key: 'latest',
        products,
        fetched_at: new Date().toISOString(),
      };
      await db.put('products', snapshot);
    } catch {
      // Snapshot refresh is best-effort; a stale cache beats none.
    }
  }

  /** Offline product search over the last successful snapshot. */
  async searchProductsOffline(query: string): Promise<Variant[]> {
    const db = await offlineDb();
    const snapshot = await db.get('products', 'latest');
    if (!snapshot) return [];
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return snapshot.products
      .filter(
        v =>
          (v.product_name ?? '').toLowerCase().includes(q) ||
          (v.variant_name ?? '').toLowerCase().includes(q) ||
          (v.sku ?? '').toLowerCase().includes(q) ||
          (v.barcode ?? '').toLowerCase().includes(q)
      )
      .slice(0, 20);
  }
}
