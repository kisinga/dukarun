import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { SupabaseService, type AppIdentity } from '../../core/supabase.service';
import { PosRpcError, PosService, Variant } from '../pos.service';
import { ConnectivityService } from './connectivity.service';
import {
  OutboxEntry,
  ProductSnapshot,
  belongsToIdentity,
  offlineDb,
  offlineScopeKey,
  type PosSettingsSnapshot,
} from './offline-db';

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
  private readonly supabase = inject(SupabaseService);

  /** All outbox entries (queued + failed), FIFO by queued_at. */
  readonly entries = signal<OutboxEntry[]>([]);
  readonly queuedCount = computed(() => this.entries().filter(e => e.status === 'queued').length);
  readonly failedCount = computed(() => this.entries().filter(e => e.status === 'failed').length);
  /** Pre-v3 entries are preserved, but never replayed without a tenant identity. */
  readonly legacyEntryCount = signal(0);
  readonly syncing = signal(false);
  /** Bumped after a sync pass that posted at least one sale — screens can refresh. */
  readonly lastPostedAt = signal<string | null>(null);
  readonly usingCachedCatalog = signal(false);
  readonly productSnapshotFetchedAt = signal<string | null>(null);
  private catalogScope: string | null = null;

  constructor() {
    // App start, account change, reconnect, and resume-from-suspension triggers.
    effect(() => {
      const identity = this.supabase.offlineIdentity();
      const online = this.connectivity.online();
      this.connectivity.resumeTick();
      untracked(() => {
        const scope = identity ? offlineScopeKey(identity) : null;
        if (scope !== this.catalogScope) {
          this.catalogScope = scope;
          this.usingCachedCatalog.set(false);
          this.productSnapshotFetchedAt.set(null);
        }
        if (!identity) {
          this.entries.set([]);
          return;
        }
        void this.refresh();
        if (online) void this.sync();
      });
    });
    // Periodic retry while online.
    if (typeof setInterval !== 'undefined') {
      setInterval(() => {
        if (this.connectivity.online() && !this.syncing()) void this.sync();
      }, SYNC_INTERVAL_MS);
    }
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      // Best effort: browsers may decline, but requesting persistence reduces
      // eviction risk for queued sales on storage-constrained devices.
      void navigator.storage.persist().catch(() => false);
    }
  }

  /** Persist a locally-completed sale and surface it in the queue. */
  async enqueue(
    entry: Omit<OutboxEntry, 'client_ref' | 'queued_at' | 'status' | 'company_id' | 'user_id'>,
    clientRef: string = crypto.randomUUID()
  ): Promise<string> {
    const identity = this.requireIdentity();
    const full: OutboxEntry = {
      ...entry,
      company_id: identity.companyId,
      user_id: identity.userId,
      client_ref: clientRef,
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
    const identity = this.supabase.offlineIdentity();
    if (!identity || this.syncing() || !this.connectivity.online()) return;
    const identityKey = offlineScopeKey(identity);
    this.syncing.set(true);
    let posted = 0;
    try {
      const db = await offlineDb();
      const queued = (await db.getAllFromIndex('outbox', 'by-queued-at')).filter(
        e => belongsToIdentity(e, identity) && e.status === 'queued'
      );
      for (const entry of queued) {
        const currentIdentity = this.supabase.offlineIdentity();
        if (!currentIdentity || offlineScopeKey(currentIdentity) !== identityKey) break;
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
    const identity = this.requireIdentity();
    const db = await offlineDb();
    const entry = await db.get('outbox', clientRef);
    if (!entry || !belongsToIdentity(entry, identity)) return;
    await db.put('outbox', { ...entry, status: 'queued', error: undefined });
    await this.refresh();
    void this.sync();
  }

  /** User explicitly discarded a failed sale (UI confirms first). */
  async discard(clientRef: string): Promise<void> {
    const identity = this.requireIdentity();
    const db = await offlineDb();
    const entry = await db.get('outbox', clientRef);
    if (entry && belongsToIdentity(entry, identity)) await db.delete('outbox', clientRef);
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const identity = this.supabase.offlineIdentity();
    if (!identity) {
      this.entries.set([]);
      return;
    }
    const db = await offlineDb();
    const all = await db.getAllFromIndex('outbox', 'by-queued-at');
    this.entries.set(all.filter(entry => belongsToIdentity(entry, identity)));
    this.legacyEntryCount.set(all.filter(entry => !entry.company_id || !entry.user_id).length);
  }

  // --- Product snapshot (offline search on the Sell screen) ---

  /** Cache the active catalog in IndexedDB. Fire-and-forget when online. */
  async refreshProductSnapshot(): Promise<boolean> {
    const identity = this.supabase.offlineIdentity();
    if (!identity || !this.connectivity.online()) return false;
    try {
      const products = await this.pos.fetchActiveVariants();
      const currentIdentity = this.supabase.offlineIdentity();
      if (!currentIdentity || offlineScopeKey(currentIdentity) !== offlineScopeKey(identity)) {
        return false;
      }
      const db = await offlineDb();
      const snapshot: ProductSnapshot = {
        key: offlineScopeKey(identity),
        company_id: identity.companyId,
        user_id: identity.userId,
        products,
        fetched_at: new Date().toISOString(),
      };
      await db.put('products', snapshot);
      this.productSnapshotFetchedAt.set(snapshot.fetched_at);
      return true;
    } catch {
      // Snapshot refresh is best-effort; a stale cache beats none.
      return false;
    }
  }

  /** Online-first quick picks with an automatic scoped snapshot fallback. */
  async topVariants(limit: number): Promise<Variant[]> {
    if (this.connectivity.online()) {
      try {
        const variants = await this.pos.topVariants(limit);
        this.usingCachedCatalog.set(false);
        return variants;
      } catch {
        // Degraded/captive networks should still use the last good snapshot.
      }
    }
    return this.offlineTopVariants(limit);
  }

  /** Online-first search with an automatic scoped snapshot fallback. */
  async searchProducts(query: string): Promise<Variant[]> {
    if (this.connectivity.online()) {
      try {
        const variants = await this.pos.searchVariants(query);
        this.usingCachedCatalog.set(false);
        return variants;
      } catch {
        // Fall through to the local snapshot.
      }
    }
    return this.searchProductsOffline(query);
  }

  /** Offline quick-pick source: first rows of the snapshot. */
  async offlineTopVariants(limit: number): Promise<Variant[]> {
    const snapshot = await this.productSnapshot();
    this.usingCachedCatalog.set(true);
    return (snapshot?.products ?? []).slice(0, limit);
  }

  /** Offline product search over the last successful snapshot. */
  async searchProductsOffline(query: string): Promise<Variant[]> {
    const snapshot = await this.productSnapshot();
    this.usingCachedCatalog.set(true);
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

  /** Tenant-scoped payment settings with stale-on-error behavior. */
  async paymentMethods(): Promise<string[]> {
    const identity = this.supabase.offlineIdentity();
    if (!identity) return ['cash', 'mpesa', 'bank'];
    const key = offlineScopeKey(identity);
    if (this.connectivity.online()) {
      try {
        const methods = await this.pos.enabledPaymentMethods();
        const snapshot: PosSettingsSnapshot = {
          key,
          company_id: identity.companyId,
          user_id: identity.userId,
          payment_methods: methods,
          fetched_at: new Date().toISOString(),
        };
        const db = await offlineDb();
        await db.put('settings', snapshot);
        return methods;
      } catch {
        // Use the last confirmed configuration below.
      }
    }
    const db = await offlineDb();
    return (await db.get('settings', key))?.payment_methods ?? ['cash', 'mpesa', 'bank'];
  }

  catalogStatusLabel(): string {
    const fetchedAt = this.productSnapshotFetchedAt();
    if (!fetchedAt) return 'Cached catalog unavailable';
    const elapsedMinutes = Math.max(
      0,
      Math.floor((Date.now() - new Date(fetchedAt).getTime()) / 60_000)
    );
    if (elapsedMinutes < 1) return 'Cached catalog · updated just now';
    if (elapsedMinutes < 60) return `Cached catalog · updated ${elapsedMinutes}m ago`;
    if (elapsedMinutes < 1_440) {
      return `Cached catalog · updated ${Math.floor(elapsedMinutes / 60)}h ago`;
    }
    return `Cached catalog · updated ${Math.floor(elapsedMinutes / 1_440)}d ago`;
  }

  private async productSnapshot(): Promise<ProductSnapshot | undefined> {
    const identity = this.supabase.offlineIdentity();
    if (!identity) return undefined;
    const db = await offlineDb();
    const snapshot = await db.get('products', offlineScopeKey(identity));
    this.productSnapshotFetchedAt.set(snapshot?.fetched_at ?? null);
    return snapshot;
  }

  private requireIdentity(): AppIdentity {
    const identity = this.supabase.offlineIdentity();
    if (!identity) throw new Error('Sign in again before storing or syncing offline sales.');
    return identity;
  }
}
