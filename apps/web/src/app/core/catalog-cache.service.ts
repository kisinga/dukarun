import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { LocationContextService } from './location-context.service';
import { ConnectivityService } from '../pos/offline/connectivity.service';
import { offlineDb, offlineScopeKey, type ProductSnapshot } from '../pos/offline/offline-db';
import type { Variant } from '../pos/pos.service';

const CATALOG_LIMIT = 2_000;
/** Row-level patch fetches are buffered this long to coalesce bursts. */
const PATCH_BUFFER_MS = 500;
/** More buffered events than this falls back to one full silent refresh. */
const PATCH_BUFFER_MAX = 20;

/**
 * Shared realtime-backed catalog cache — the single writer of the
 * `products` IndexedDB snapshot (stale-while-revalidate):
 * reads emit the cached snapshot immediately, then a background refresh
 * from variant_catalog (plus realtime patches) keeps it current.
 * Scope is company + user + location; any change resets and reloads.
 */
@Injectable({ providedIn: 'root' })
export class CatalogCacheService {
  private readonly supabase = inject(SupabaseService);
  private readonly connectivity = inject(ConnectivityService);
  private readonly locations = inject(LocationContextService);

  readonly catalog = signal<Variant[]>([]);
  readonly fetchedAt = signal<string | null>(null);
  /** True when the catalog exceeds the offline cache — only the first rows are kept. */
  readonly catalogTruncated = signal(false);
  /** True once a snapshot (cached or fresh) is available for the current scope. */
  readonly loaded = signal(false);

  private scope: string | null = null;
  private companyId: string | null = null;
  private channel: RealtimeChannel | null = null;
  private refreshPromise: Promise<boolean> | null = null;
  private wasOnline = true;

  private patchTimer: ReturnType<typeof setTimeout> | null = null;
  private patchEventCount = 0;
  private readonly upsertVariantIds = new Set<string>();
  private readonly deleteVariantIds = new Set<string>();
  private readonly productIds = new Set<string>();

  constructor() {
    effect(() => {
      const identity = this.supabase.offlineIdentity();
      const locationId = this.locations.activeId();
      const online = this.connectivity.online();
      this.connectivity.resumeTick();
      untracked(() => {
        const scope = identity ? offlineScopeKey(identity, locationId) : null;
        if (scope !== this.scope) {
          this.scope = scope;
          this.companyId = identity?.companyId ?? null;
          this.reset();
          this.subscribeChannel();
          if (scope) void this.ensureLoaded();
        }
        // Reconnect healing: one full silent refresh after being offline.
        if (online && !this.wasOnline && scope) void this.refresh();
        this.wasOnline = online;
      });
    });
  }

  /**
   * Emit the IndexedDB snapshot immediately, then background-refresh when
   * online. Safe to call from every consumer — refreshes are shared.
   */
  async ensureLoaded(): Promise<void> {
    if (!this.scope) return;
    const db = await offlineDb();
    const snapshot = await db.get('products', this.scope);
    if (this.scope !== snapshot?.key) return;
    if (snapshot) {
      this.catalog.set(snapshot.products);
      this.fetchedAt.set(snapshot.fetched_at);
      this.loaded.set(true);
    }
    if (this.connectivity.online()) void this.refresh();
  }

  /** Current in-memory catalog rows (empty until ensureLoaded resolves). */
  getCatalog(): Variant[] {
    return this.catalog();
  }

  /** Full silent refresh; all callers share one in-flight request. */
  refresh(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.fetchSnapshot().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private async fetchSnapshot(): Promise<boolean> {
    const identity = this.supabase.offlineIdentity();
    const locationId = this.locations.activeId();
    if (!identity || !locationId || !this.connectivity.online()) return false;
    const scope = offlineScopeKey(identity, locationId);
    try {
      const { data, error, count } = await this.supabase.client
        .from('variant_catalog')
        .select('*', { count: 'exact' })
        .order('product_name')
        .order('variant_name')
        .order('variant_id')
        .limit(CATALOG_LIMIT);
      if (error) throw error;
      // Discard the write if the user switched company/location mid-flight.
      if (scope !== this.scope) return false;
      const db = await offlineDb();
      const snapshot: ProductSnapshot = {
        key: scope,
        company_id: identity.companyId,
        user_id: identity.userId,
        location_id: locationId,
        products: data,
        fetched_at: new Date().toISOString(),
      };
      await db.put('products', snapshot);
      this.catalog.set(snapshot.products);
      this.fetchedAt.set(snapshot.fetched_at);
      this.catalogTruncated.set((count ?? data.length) > CATALOG_LIMIT);
      this.loaded.set(true);
      return true;
    } catch {
      // Snapshot refresh is best-effort; a stale cache beats none.
      return false;
    }
  }

  // --- Realtime patching ---

  private subscribeChannel(): void {
    if (this.channel) {
      void this.supabase.client.removeChannel(this.channel);
      this.channel = null;
    }
    if (!this.companyId) return;
    try {
      const filter = `company_id=eq.${this.companyId}`;
      this.channel = this.supabase.client
        .channel(`catalog-live:${this.companyId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'product_variants', filter },
          payload => this.onVariantChange(payload)
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'products', filter },
          payload => this.onProductChange(payload)
        )
        .subscribe();
    } catch {
      // Full refreshes (reconnect/manual) remain the fallback.
    }
  }

  private onVariantChange(payload: {
    eventType: string;
    new: Record<string, unknown>;
    old: Record<string, unknown>;
  }): void {
    if (payload.eventType === 'DELETE') {
      const id = payload.old['id'] as string | undefined;
      if (id) {
        this.deleteVariantIds.add(id);
        this.upsertVariantIds.delete(id);
      }
    } else {
      const id = payload.new['id'] as string | undefined;
      if (id) {
        this.upsertVariantIds.add(id);
        this.deleteVariantIds.delete(id);
      }
    }
    this.bufferPatch();
  }

  private onProductChange(payload: {
    eventType: string;
    new: Record<string, unknown>;
    old: Record<string, unknown>;
  }): void {
    const id = (payload.new['id'] ?? payload.old['id']) as string | undefined;
    if (id) this.productIds.add(id);
    this.bufferPatch();
  }

  /** Coalesce bursts; beyond PATCH_BUFFER_MAX one full refresh is cheaper. */
  private bufferPatch(): void {
    this.patchEventCount++;
    if (this.patchEventCount > PATCH_BUFFER_MAX) {
      this.clearPatchBuffer();
      void this.refresh();
      return;
    }
    if (this.patchTimer) clearTimeout(this.patchTimer);
    this.patchTimer = setTimeout(() => void this.flushPatches(), PATCH_BUFFER_MS);
  }

  private clearPatchBuffer(): void {
    if (this.patchTimer) clearTimeout(this.patchTimer);
    this.patchTimer = null;
    this.patchEventCount = 0;
    this.upsertVariantIds.clear();
    this.deleteVariantIds.clear();
    this.productIds.clear();
  }

  private async flushPatches(): Promise<void> {
    if (!this.scope || !this.connectivity.online()) {
      this.clearPatchBuffer();
      return;
    }
    const upsertIds = [...this.upsertVariantIds];
    const deleteIds = [...this.deleteVariantIds];
    const productIds = [...this.productIds];
    this.clearPatchBuffer();
    try {
      let rows = this.catalog().filter(
        v => !deleteIds.includes(v.variant_id!) && !productIds.includes(v.product_id!)
      );
      if (upsertIds.length > 0) {
        const { data, error } = await this.supabase.client
          .from('variant_catalog')
          .select('*')
          .in('variant_id', upsertIds);
        if (error) throw error;
        const patched = new Map((data ?? []).map(row => [row.variant_id, row]));
        rows = rows.map(v => patched.get(v.variant_id) ?? v);
        for (const id of upsertIds) {
          const row = patched.get(id);
          if (row && !rows.some(v => v.variant_id === id)) rows.push(row);
        }
      }
      if (productIds.length > 0) {
        const { data, error } = await this.supabase.client
          .from('variant_catalog')
          .select('*')
          .in('product_id', productIds);
        if (error) throw error;
        rows.push(...(data ?? []));
      }
      rows.sort(
        (a, b) =>
          (a.product_name ?? '').localeCompare(b.product_name ?? '') ||
          (a.variant_name ?? '').localeCompare(b.variant_name ?? '') ||
          (a.variant_id ?? '').localeCompare(b.variant_id ?? '')
      );
      if (!this.scope) return;
      this.catalog.set(rows);
      const db = await offlineDb();
      const existing = await db.get('products', this.scope);
      if (existing) await db.put('products', { ...existing, products: rows });
    } catch {
      // A failed patch leaves the stale snapshot; the next refresh heals it.
    }
  }

  private reset(): void {
    this.clearPatchBuffer();
    this.catalog.set([]);
    this.fetchedAt.set(null);
    this.catalogTruncated.set(false);
    this.loaded.set(false);
  }
}
