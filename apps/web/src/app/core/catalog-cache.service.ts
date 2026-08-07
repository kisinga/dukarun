import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { LocationContextService } from './location-context.service';
import { ConnectivityService } from '../pos/offline/connectivity.service';
import {
  offlineDb,
  offlineScopeKey,
  type CachedManufacturer,
  type ProductSnapshot,
} from '../pos/offline/offline-db';
import {
  PosService,
  type CollectionWithCount,
  type Product,
  type Variant,
} from '../pos/pos.service';

const CATALOG_LIMIT = 2_000;
const CATALOG_MAX_AGE_MS = 5 * 60_000;
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
  private readonly pos = inject(PosService);

  readonly catalog = signal<Variant[]>([]);
  readonly families = signal<Product[]>([]);
  readonly manufacturers = signal<CachedManufacturer[]>([]);
  readonly collections = signal<CollectionWithCount[]>([]);
  readonly stock = signal<Map<string, { stock: number; stock_value: number }>>(new Map());
  readonly fetchedAt = signal<string | null>(null);
  /** True when the catalog exceeds the offline cache — only the first rows are kept. */
  readonly catalogTruncated = signal(false);
  /** True once a snapshot (cached or fresh) is available for the current scope. */
  readonly loaded = signal(false);

  private scope: string | null = null;
  private companyId: string | null = null;
  private channel: RealtimeChannel | null = null;
  private refreshPromise: Promise<boolean> | null = null;
  private stockRefreshPromise: Promise<boolean> | null = null;
  private wasOnline = true;

  private patchTimer: ReturnType<typeof setTimeout> | null = null;
  private patchEventCount = 0;
  private readonly upsertVariantIds = new Set<string>();
  private readonly deleteVariantIds = new Set<string>();
  private readonly productIds = new Set<string>();
  private stockDirty = false;
  private referencesDirty = false;

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
  async ensureLoaded(): Promise<boolean> {
    const requestedScope = this.scope;
    if (!requestedScope) return false;
    const db = await offlineDb();
    const snapshot = await db.get('products', requestedScope);
    if (this.scope !== requestedScope) return false;
    // Pre-location-stock snapshots are unsafe for POS availability and must be
    // rehydrated once instead of presenting company-wide stock as local stock.
    if (snapshot?.location_stock) {
      this.applySnapshot(snapshot);
    }
    const stale =
      !snapshot ||
      snapshot.manufacturers === undefined ||
      snapshot.collections === undefined ||
      Date.now() - new Date(snapshot.fetched_at).getTime() >= CATALOG_MAX_AGE_MS;
    if (this.connectivity.online() && stale) void this.refresh();
    return !!snapshot?.families && !!snapshot.location_stock;
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
      const [catalogResult, familyResult, stockResult, manufacturers, collections] =
        await Promise.all([
          this.supabase.client
            .from('variant_catalog')
            .select('*')
            .order('product_name')
            .order('variant_name')
            .order('variant_id')
            .limit(CATALOG_LIMIT + 1),
          this.supabase.client
            .from('products')
            .select('*')
            .order('name')
            .limit(CATALOG_LIMIT + 1),
          this.supabase.client.rpc('location_stock_snapshot', { p_location_id: locationId }),
          this.pos.listManufacturers(),
          this.pos.listCollections(),
        ]);
      if (catalogResult.error) throw catalogResult.error;
      if (familyResult.error) throw familyResult.error;
      if (stockResult.error) throw stockResult.error;
      // Discard the write if the user switched company/location mid-flight.
      if (scope !== this.scope) return false;
      const locationStock = (stockResult.data ?? []).map(row => ({
        variant_id: row.variant_id!,
        stock: Number(row.stock ?? 0),
        stock_value: row.stock_value ?? 0,
      }));
      const stockByVariant = new Map(locationStock.map(row => [row.variant_id, row]));
      const products = (catalogResult.data ?? []).slice(0, CATALOG_LIMIT).map(row => ({
        ...row,
        stock: stockByVariant.get(row.variant_id!)?.stock ?? 0,
      }));
      const manufacturerOptions = this.mergeManufacturers(manufacturers, products);
      const db = await offlineDb();
      const snapshot: ProductSnapshot = {
        key: scope,
        company_id: identity.companyId,
        user_id: identity.userId,
        location_id: locationId,
        products,
        families: (familyResult.data ?? []).slice(0, CATALOG_LIMIT),
        location_stock: locationStock,
        manufacturers: manufacturerOptions,
        collections,
        truncated:
          (catalogResult.data?.length ?? 0) > CATALOG_LIMIT ||
          (familyResult.data?.length ?? 0) > CATALOG_LIMIT,
        fetched_at: new Date().toISOString(),
      };
      await db.put('products', snapshot);
      this.applySnapshot(snapshot);
      return true;
    } catch {
      // Snapshot refresh is best-effort; a stale cache beats none.
      return false;
    }
  }

  /** Inventory events only need a location-stock refresh, not a full catalog download. */
  private refreshStock(): Promise<boolean> {
    if (this.stockRefreshPromise) return this.stockRefreshPromise;
    const run = async (): Promise<boolean> => {
      const locationId = this.locations.activeId();
      const scope = this.scope;
      if (!locationId || !scope || !this.connectivity.online()) return false;
      const { data, error } = await this.supabase.client.rpc('location_stock_snapshot', {
        p_location_id: locationId,
      });
      if (error || scope !== this.scope) return false;
      const locationStock = (data ?? []).map(row => ({
        variant_id: row.variant_id!,
        stock: Number(row.stock ?? 0),
        stock_value: row.stock_value ?? 0,
      }));
      const stockByVariant = new Map(locationStock.map(row => [row.variant_id, row]));
      const products = this.catalog().map(row => ({
        ...row,
        stock: stockByVariant.get(row.variant_id!)?.stock ?? 0,
      }));
      const db = await offlineDb();
      const existing = await db.get('products', scope);
      if (!existing || scope !== this.scope) return false;
      const snapshot = { ...existing, products, location_stock: locationStock };
      await db.put('products', snapshot);
      this.applySnapshot(snapshot);
      return true;
    };
    this.stockRefreshPromise = run().finally(() => (this.stockRefreshPromise = null));
    return this.stockRefreshPromise;
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
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'inventory_batches', filter },
          () => {
            this.stockDirty = true;
            this.bufferPatch();
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'manufacturers', filter },
          () => this.onReferenceChange()
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'collections', filter },
          () => this.onReferenceChange()
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'product_collections', filter },
          () => this.onReferenceChange()
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

  private onReferenceChange(): void {
    this.referencesDirty = true;
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
    this.stockDirty = false;
    this.referencesDirty = false;
  }

  private async flushPatches(): Promise<void> {
    if (!this.scope || !this.connectivity.online()) {
      this.clearPatchBuffer();
      return;
    }
    const upsertIds = [...this.upsertVariantIds];
    const deleteIds = [...this.deleteVariantIds];
    const productIds = [...this.productIds];
    const stockDirty = this.stockDirty;
    const referencesDirty = this.referencesDirty;
    this.clearPatchBuffer();
    try {
      // Family changes affect both the management rows and all child labels.
      if (productIds.length > 0 || referencesDirty) {
        await this.refresh();
        return;
      }
      let rows = this.catalog().filter(v => !deleteIds.includes(v.variant_id!));
      if (upsertIds.length > 0) {
        const { data, error } = await this.supabase.client
          .from('variant_catalog')
          .select('*')
          .in('variant_id', upsertIds);
        if (error) throw error;
        const stock = this.stock();
        const patched = new Map(
          (data ?? []).map(row => [
            row.variant_id,
            { ...row, stock: stock.get(row.variant_id!)?.stock ?? 0 },
          ])
        );
        rows = rows.map(v => patched.get(v.variant_id) ?? v);
        for (const id of upsertIds) {
          const row = patched.get(id);
          if (row && !rows.some(v => v.variant_id === id)) rows.push(row);
        }
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
      if (stockDirty) await this.refreshStock();
    } catch {
      // A failed patch leaves the stale snapshot; the next refresh heals it.
    }
  }

  private applySnapshot(snapshot: ProductSnapshot): void {
    this.catalog.set(snapshot.products);
    this.families.set(snapshot.families ?? []);
    this.manufacturers.set(
      this.mergeManufacturers(snapshot.manufacturers ?? [], snapshot.products)
    );
    this.collections.set(snapshot.collections ?? []);
    this.stock.set(
      new Map(
        (snapshot.location_stock ?? []).map(row => [
          row.variant_id,
          { stock: row.stock, stock_value: row.stock_value },
        ])
      )
    );
    this.fetchedAt.set(snapshot.fetched_at);
    this.catalogTruncated.set(snapshot.truncated ?? false);
    this.loaded.set(true);
  }

  private reset(): void {
    this.clearPatchBuffer();
    this.catalog.set([]);
    this.families.set([]);
    this.manufacturers.set([]);
    this.collections.set([]);
    this.stock.set(new Map());
    this.fetchedAt.set(null);
    this.catalogTruncated.set(false);
    this.loaded.set(false);
  }

  private mergeManufacturers(
    manufacturers: readonly CachedManufacturer[],
    products: readonly Variant[]
  ): CachedManufacturer[] {
    const byId = new Map(manufacturers.map(item => [item.id, item]));
    for (const product of products) {
      if (product.manufacturer_id && product.manufacturer_name) {
        byId.set(product.manufacturer_id, {
          id: product.manufacturer_id,
          name: product.manufacturer_name,
        });
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}
