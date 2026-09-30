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
import { OfflinePostingService } from './offline-posting.service';
import {
  offlineDeviceKey,
  offlineBlockerLabel,
  type OfflineRequest,
  type OfflineReviewSummary,
} from './offline-contract';

export type BarcodeResolution =
  | { status: 'found'; variant: Variant; source: 'server' | 'cache' }
  | { status: 'unknown' }
  | { status: 'ambiguous' }
  | { status: 'incomplete' };

const SYNC_INTERVAL_MS = 30_000;

/**
 * Offline sales outbox + sync engine.
 *
 * Honesty rules (do not break these):
 *  - Queued sales are NOT server truth: they never appear in Today's Sales,
 *    only in the "Pending sync" list, and the user is told "queued", never
 *    "completed".
 *  - Replay is FIFO via immutable submit_offline_sale requests, so
 *    a sale whose response was lost is safe to replay.
 *  - Network failure mid-sync: stop, keep everything queued, retry later.
 *  - Server rejection (P0001): mark the entry failed with the server message
 *    and leave it for explicit review and audited resolution. Never silently
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
  private readonly posting = inject(OfflinePostingService);

  /** All outbox entries (queued + failed), FIFO by queued_at. */
  readonly entries = signal<OutboxEntry[]>([]);
  readonly queuedCount = computed(() => this.entries().filter(e => e.status === 'queued').length);
  readonly failedCount = computed(() => this.entries().filter(e => e.status === 'failed').length);
  readonly reviews = signal<OfflineReviewSummary[]>([]);
  readonly lastPostedCount = signal(0);
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
  private readonly deviceKey = offlineDeviceKey();

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
                if (
                  changes.some(change =>
                    ['payment_method', 'payment_account'].includes(change.entityType)
                  )
                ) {
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
          this.reviews.set([]);
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

  /** Persist the original capture once; status updates never rewrite its request. */
  async enqueue(
    entry: Omit<OfflineRequest, 'protocol_version' | 'client_ref'>,
    clientRef: string = crypto.randomUUID()
  ): Promise<string> {
    const identity = this.requireIdentity();
    if (
      !entry.offline_context_id ||
      !entry.originating_session_id ||
      !entry.occurred_at ||
      !entry.location_id
    ) {
      throw new Error('An open session confirmation is required before taking an offline sale.');
    }
    const request: OfflineRequest = JSON.parse(
      JSON.stringify({ ...entry, protocol_version: 2, client_ref: clientRef })
    );
    const full: OutboxEntry = {
      ...request,
      request,
      company_id: identity.companyId,
      user_id: identity.userId,
      queued_at: new Date().toISOString(),
      status: 'queued',
    };
    const db = await offlineDb();
    const transaction = db.transaction('outbox', 'readwrite');
    const existing = await transaction.store.get(clientRef);
    if (existing) {
      if (
        !belongsToIdentity(existing, identity) ||
        JSON.stringify(existing.request) !== JSON.stringify(request)
      ) {
        transaction.abort();
        throw new Error(
          'This sale reference already has a different queued request. Review it before making corrections.'
        );
      }
    } else await transaction.store.add(full);
    await transaction.done;
    await this.refresh();
    return clientRef;
  }

  /** All retries send the exact captured request. Holds require explicit review. */
  async sync(): Promise<void> {
    const identity = this.supabase.offlineIdentity();
    if (!identity || this.syncing() || !this.connectivity.online()) return;
    const identityKey = offlineScopeKey(identity);
    this.syncing.set(true);
    this.lastPostedCount.set(0);
    let posted = 0;
    try {
      const db = await offlineDb();
      const entries = (await db.getAllFromIndex('outbox', 'by-queued-at')).filter(
        e =>
          belongsToIdentity(e, identity) && (e.status === 'queued' || !!e.outcome?.durable_custody)
      );
      for (const entry of entries) {
        const currentIdentity = this.supabase.offlineIdentity();
        if (!currentIdentity || offlineScopeKey(currentIdentity) !== identityKey) break;
        try {
          // Held custody stays in review; an approved attempt may resume normal validation.
          const result = await this.posting.submit(entry.request);
          if (result.status === 'completed' || result.status === 'cancelled') {
            await db.delete('outbox', entry.client_ref);
            if (result.status === 'completed') posted++;
          } else {
            await db.put('outbox', {
              ...entry,
              status: result.status,
              outcome: result,
              error: result.blockers.map(offlineBlockerLabel).join('. '),
            });
          }
        } catch (error) {
          if (error instanceof PosRpcError && error.code === 'P0001') {
            await db.put('outbox', { ...entry, status: 'failed', error: error.message });
          } else break; // Ambiguous results retain the full request for safe retry.
        }
      }
      const remaining = (await db.getAllFromIndex('outbox', 'by-queued-at')).filter(entry =>
        belongsToIdentity(entry, identity)
      );
      for (const locationId of new Set([
        this.locations.requireActiveId(),
        ...remaining.map(e => e.location_id!),
      ])) {
        const count = remaining.filter(e => e.location_id === locationId).length;
        await this.pos.heartbeatPosDevice(this.deviceKey, locationId, count, count === 0);
      }
      if (posted > 0) this.lastPostedAt.set(new Date().toISOString());
      this.lastPostedCount.set(posted);
    } finally {
      this.syncing.set(false);
      await this.refresh();
    }
  }

  async retry(clientRef: string): Promise<void> {
    const identity = this.requireIdentity();
    const db = await offlineDb();
    const entry = await db.get('outbox', clientRef);
    if (!entry || !belongsToIdentity(entry, identity)) return;
    if (entry.outcome?.durable_custody)
      throw new Error('Open this sale for review. Its original request cannot be changed.');
    await db.put('outbox', { ...entry, status: 'queued', error: undefined });
    await this.refresh();
    await this.sync();
  }

  async refresh(): Promise<void> {
    const identity = this.supabase.offlineIdentity();
    const db = await offlineDb();
    const all = await db.getAllFromIndex('outbox', 'by-queued-at');
    this.entries.set(identity ? all.filter(entry => belongsToIdentity(entry, identity)) : []);
    if (identity && this.connectivity.online()) {
      try {
        const reviews = await this.posting.list();
        if (
          this.supabase.offlineIdentity()?.companyId === identity.companyId &&
          this.supabase.offlineIdentity()?.userId === identity.userId
        )
          this.reviews.set(reviews);
      } catch {
        /* Retain visible custody when the network is unavailable. */
      }
    }
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

  /** Server-authoritative online lookup with a duplicate-safe offline fallback. */
  async resolveBarcode(value: string): Promise<BarcodeResolution> {
    const barcode = value.trim();
    if (!barcode) return { status: 'unknown' };
    await this.catalogCache.ensureLoaded();
    if (this.connectivity.online()) {
      try {
        const variant = await this.pos.resolveBarcode(barcode);
        this.usingCachedCatalog.set(false);
        return variant ? { status: 'found', variant, source: 'server' } : { status: 'unknown' };
      } catch (error) {
        if (error instanceof PosRpcError && error.message.startsWith('barcode_ambiguous')) {
          return { status: 'ambiguous' };
        }
        // Supabase reports fetch/transport failures through the same error
        // shape, but without a PostgreSQL/PostgREST code. Only coded server
        // responses are authoritative rejections.
        if (error instanceof PosRpcError && error.code !== '') throw error;
        // A transport failure can happen before the connectivity signal catches up.
        // Preserve offline selling by consulting the last confirmed snapshot.
      }
    }
    this.usingCachedCatalog.set(true);
    const cached = this.catalogCache.resolveCachedBarcode(barcode);
    return cached.status === 'found'
      ? { status: 'found', variant: cached.variant, source: 'cache' }
      : cached;
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
      defaultAccountCode: method.default_account_code,
      accounts: method.accounts.map(account => ({
        code: account.code,
        name: account.name,
        isDefault: account.is_default,
      })),
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
