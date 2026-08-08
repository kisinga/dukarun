import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService, type AppIdentity } from '../../core/supabase.service';
import { PosRpcError, PosService, Variant } from '../pos.service';
import { ConnectivityService } from './connectivity.service';
import { LocationContextService } from '../../core/location-context.service';
import { CatalogCacheService } from '../../core/catalog-cache.service';
import { CatalogSearchService } from '../../core/catalog-search.service';
import {
  OutboxEntry,
  belongsToIdentity,
  offlineDb,
  offlineScopeKey,
  type CachedPaymentMethod,
  type PosSettingsSnapshot,
} from './offline-db';
import { CacheJournalService, type CacheStreamHandler } from '../../core/cache-journal.service';

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
  private readonly locations = inject(LocationContextService);
  private readonly catalogCache = inject(CatalogCacheService);
  private readonly catalogSearch = inject(CatalogSearchService);
  private readonly journal = inject(CacheJournalService);

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
  /** Mirror of the shared catalog cache timestamp (CatalogCacheService owns the snapshot). */
  readonly productSnapshotFetchedAt = computed(() => this.catalogCache.fetchedAt());
  private catalogScope: string | null = null;
  private settingsScope: string | null = null;
  private settingsChannel: RealtimeChannel | null = null;
  private settingsHandler: CacheStreamHandler | null = null;

  constructor() {
    // App start, account change, reconnect, and resume-from-suspension triggers.
    effect(() => {
      const identity = this.supabase.offlineIdentity();
      const locationId = this.locations.activeId();
      const online = this.connectivity.online();
      this.connectivity.resumeTick();
      untracked(() => {
        const scope = identity ? offlineScopeKey(identity, locationId) : null;
        if (scope !== this.catalogScope) {
          this.catalogScope = scope;
          this.usingCachedCatalog.set(false);
        }
        if (scope !== this.settingsScope) {
          if (this.settingsChannel) void this.supabase.client.removeChannel(this.settingsChannel);
          this.settingsScope = scope;
          this.settingsChannel = null;
          this.settingsHandler = null;
          if (identity && locationId && scope) {
            this.settingsHandler = {
              apply: async changes => {
                if (changes.some(change => change.entityType === 'payment_method')) {
                  await this.refreshPaymentMethods(identity, locationId, scope);
                }
              },
              reset: async () => {
                await this.refreshPaymentMethods(identity, locationId, scope);
                return true;
              },
            };
            this.settingsChannel = this.journal.subscribe(
              'settings',
              scope,
              identity.companyId,
              this.settingsHandler,
              'payment-methods'
            );
          }
        }
        if (online && scope && this.settingsHandler) {
          void this.journal.reconcile('settings', scope, this.settingsHandler, 'payment-methods');
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
      location_id: this.locations.requireActiveId(),
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
            entry.client_ref,
            entry.location_id,
            entry.draft_id ?? undefined
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
  // CatalogCacheService owns the snapshot; these methods only add the
  // online-first policy and the cached-catalog fallback flag.

  /** Refresh the shared catalog snapshot. Fire-and-forget when online. */
  refreshProductSnapshot(): Promise<boolean> {
    return this.catalogCache.refresh();
  }

  /** Cache-first quick picks; a cold cache waits for one server hydration. */
  async topVariants(limit: number): Promise<Variant[]> {
    await this.catalogCache.ensureLoaded();
    let variants = this.sellable(this.catalogCache.getCatalog()).slice(0, limit);
    if (variants.length === 0 && this.connectivity.online()) {
      await this.catalogCache.refresh();
      variants = this.sellable(this.catalogCache.getCatalog()).slice(0, limit);
    }
    this.usingCachedCatalog.set(!this.connectivity.online());
    return variants;
  }

  /** Local search is instant; oversized catalogs retain server-side search. */
  async searchProducts(query: string): Promise<Variant[]> {
    const result = await this.catalogSearch.search(query, 20);
    this.usingCachedCatalog.set(
      result.source === 'cache' && (!this.connectivity.online() || result.incomplete)
    );
    return result.variants;
  }

  /** Offline quick-pick source: first active rows of the snapshot. */
  async offlineTopVariants(limit: number): Promise<Variant[]> {
    this.usingCachedCatalog.set(true);
    await this.catalogCache.ensureLoaded();
    return this.sellable(this.catalogCache.getCatalog()).slice(0, limit);
  }

  /** Offline product search over the last successful snapshot. */
  async searchProductsOffline(query: string): Promise<Variant[]> {
    this.usingCachedCatalog.set(true);
    return (await this.catalogSearch.searchCached(query, 20)).variants;
  }

  /** The shared cache holds the full catalog; the Sell screen only sells active rows. */
  private sellable(variants: Variant[]): Variant[] {
    return variants.filter(v => v.variant_active && v.product_active);
  }

  /** Tenant-scoped payment settings with stale-on-error behavior. */
  async paymentMethods(): Promise<CachedPaymentMethod[]> {
    const identity = this.supabase.offlineIdentity();
    const locationId = this.locations.activeId();
    if (!identity || !locationId) return [];
    const key = offlineScopeKey(identity, locationId);
    const db = await offlineDb();
    const cached = await db.get('settings', key);
    if (cached?.payment_methods_fetched_at) return cached.payment_methods;
    if (this.connectivity.online()) {
      try {
        return await this.refreshPaymentMethods(identity, locationId, key);
      } catch {
        // Use the last confirmed configuration below.
      }
    }
    return cached?.payment_methods ?? [];
  }

  private async refreshPaymentMethods(
    identity: AppIdentity,
    locationId: string,
    key: string
  ): Promise<CachedPaymentMethod[]> {
    const methods = (await this.pos.enabledPaymentMethods()).map(method => ({
      code: method.code,
      name: method.name,
      isCashierControlled: method.is_cashier_controlled,
      reconciliationType: method.reconciliation_type ?? null,
    }));
    const currentIdentity = this.supabase.offlineIdentity();
    const currentLocationId = this.locations.activeId();
    if (
      !currentIdentity ||
      !currentLocationId ||
      offlineScopeKey(currentIdentity, currentLocationId) !== key
    ) {
      throw new Error('cache_scope_changed');
    }
    const db = await offlineDb();
    const existing = await db.get('settings', key);
    const now = new Date().toISOString();
    const snapshot: PosSettingsSnapshot = {
      ...existing,
      key,
      company_id: identity.companyId,
      user_id: identity.userId,
      location_id: locationId,
      payment_methods: methods,
      payment_methods_fetched_at: now,
      fetched_at: now,
    };
    await db.put('settings', snapshot);
    return methods;
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

  private requireIdentity(): AppIdentity {
    const identity = this.supabase.offlineIdentity();
    if (!identity) throw new Error('Sign in again before storing or syncing offline sales.');
    return identity;
  }
}
