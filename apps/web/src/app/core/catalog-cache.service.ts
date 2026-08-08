import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { LocationContextService } from './location-context.service';
import { ConnectivityService } from '../pos/offline/connectivity.service';
import {
  offlineDb,
  offlineScopeKey,
  type CatalogMetadata,
  type CatalogVariantRecord,
  type CachedManufacturer,
  type ProductSnapshot,
} from '../pos/offline/offline-db';
import {
  PosService,
  type CollectionWithCount,
  type Product,
  type Variant,
} from '../pos/pos.service';
import {
  CacheJournalService,
  type CacheChange,
  type CacheStreamHandler,
} from './cache-journal.service';

const CATALOG_LIMIT = 10_000;
const CATALOG_PAGE_SIZE = 1_000;

/**
 * Shared journal-backed catalog cache — the single writer of the
 * `products` IndexedDB snapshot. Reads emit the complete cached snapshot
 * immediately; durable journal reconciliation patches it in place.
 * Scope is company + user + location; any change resets and reloads.
 */
@Injectable({ providedIn: 'root' })
export class CatalogCacheService {
  private readonly supabase = inject(SupabaseService);
  private readonly connectivity = inject(ConnectivityService);
  private readonly locations = inject(LocationContextService);
  private readonly pos = inject(PosService);
  private readonly journal = inject(CacheJournalService);

  readonly catalog = signal<Variant[]>([]);
  readonly families = signal<Product[]>([]);
  readonly manufacturers = signal<CachedManufacturer[]>([]);
  readonly collections = signal<CollectionWithCount[]>([]);
  readonly stock = signal<Map<string, { stock: number; stock_value: number }>>(new Map());
  readonly fetchedAt = signal<string | null>(null);
  /** Defensive compatibility flag for snapshots created before the 10k ceiling. */
  readonly catalogTruncated = signal(false);
  /** True once a snapshot (cached or fresh) is available for the current scope. */
  readonly loaded = signal(false);
  readonly revision = signal(0);

  private scope: string | null = null;
  private companyId: string | null = null;
  private channel: RealtimeChannel | null = null;
  private readonly refreshes = new Map<string, Promise<boolean>>();
  private handler: CacheStreamHandler | null = null;
  private mutationTail: Promise<unknown> = Promise.resolve();

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
        if (online && scope && this.handler) {
          void this.journal.reconcile('catalog', scope, this.handler, 'catalog-cache');
        }
      });
    });
  }

  /**
   * Emit the IndexedDB snapshot immediately. The journal decides whether an
   * incremental patch or a full reset is required.
   */
  async ensureLoaded(): Promise<boolean> {
    const requestedScope = this.scope;
    if (!requestedScope) return false;
    const snapshot = await this.readSnapshot(requestedScope);
    if (this.scope !== requestedScope) return false;
    // Pre-location-stock snapshots are unsafe for POS availability and must be
    // rehydrated once instead of presenting company-wide stock as local stock.
    if (snapshot?.location_stock && !this.loaded()) {
      this.applySnapshot(snapshot);
    }
    // A missing snapshot needs a bootstrap; warm snapshots are reconciled by
    // the durable journal without paying for an unconditional full download.
    if (this.connectivity.online() && !snapshot) void this.refresh();
    return !!snapshot?.families && !!snapshot.location_stock;
  }

  /** Current in-memory catalog rows (empty until ensureLoaded resolves). */
  getCatalog(): Variant[] {
    return this.catalog();
  }

  /** Apply a quantity confirmed by a successful counted-stock RPC immediately. */
  applyConfirmedStock(variantId: string, quantity: number): void {
    const currentStock = this.stock().get(variantId);
    this.stock.update(rows => {
      const next = new Map(rows);
      next.set(variantId, {
        stock: quantity,
        stock_value: currentStock?.stock_value ?? 0,
      });
      return next;
    });
    this.catalog.update(rows =>
      rows.map(row => (row.variant_id === variantId ? { ...row, stock: quantity } : row))
    );
    void this.enqueueMutation(() => this.persistCurrent(variantId));
  }

  /** Full silent refresh; all callers share one in-flight request. */
  refresh(expectedScope: string | null = this.scope): Promise<boolean> {
    if (!expectedScope) return Promise.resolve(false);
    const active = this.refreshes.get(expectedScope);
    if (active) return active;
    const refresh = this.enqueueMutation(() => this.fetchSnapshot(expectedScope)).finally(() => {
      if (this.refreshes.get(expectedScope) === refresh) this.refreshes.delete(expectedScope);
    });
    this.refreshes.set(expectedScope, refresh);
    return refresh;
  }

  private async fetchSnapshot(expectedScope: string): Promise<boolean> {
    const identity = this.supabase.offlineIdentity();
    const locationId = this.locations.activeId();
    if (!identity || !locationId || !this.connectivity.online()) return false;
    const scope = offlineScopeKey(identity, locationId);
    if (scope !== expectedScope || scope !== this.scope) return false;
    try {
      const [catalogRows, familyRows, manufacturers, collections] = await Promise.all([
        this.fetchCatalogRows(),
        this.fetchFamilyRows(),
        this.pos.listManufacturers(),
        this.pos.listCollections(),
      ]);
      const locationStock = await this.fetchLocationStock(
        locationId,
        catalogRows.flatMap(row => (row.variant_id ? [row.variant_id] : []))
      );
      // Discard the write if the user switched company/location mid-flight.
      if (scope !== expectedScope || scope !== this.scope) return false;
      const stockByVariant = new Map(locationStock.map(row => [row.variant_id, row]));
      const products = catalogRows.map(row => ({
        ...row,
        stock: stockByVariant.get(row.variant_id!)?.stock ?? 0,
      }));
      const manufacturerOptions = this.mergeManufacturers(manufacturers, products);
      const snapshot: ProductSnapshot = {
        key: scope,
        company_id: identity.companyId,
        user_id: identity.userId,
        location_id: locationId,
        products,
        families: familyRows,
        location_stock: locationStock,
        manufacturers: manufacturerOptions,
        collections,
        truncated: false,
        fetched_at: new Date().toISOString(),
      };
      await this.replaceSnapshot(snapshot);
      this.applySnapshot(snapshot);
      return true;
    } catch {
      // Snapshot refresh is best-effort; a stale cache beats none.
      return false;
    }
  }

  private async fetchCatalogRows(): Promise<Variant[]> {
    const rows: Variant[] = [];
    let cursor: string | undefined;
    while (rows.length < CATALOG_LIMIT) {
      const { data, error } = await this.supabase.client.rpc('catalog_cache_page', {
        p_after_variant_id: cursor,
        p_limit: CATALOG_PAGE_SIZE,
      });
      if (error) throw error;
      const page = (data ?? []) as Variant[];
      rows.push(...page);
      if (page.length < CATALOG_PAGE_SIZE) break;
      cursor = page.at(-1)?.variant_id ?? undefined;
    }
    return this.sortVariants(rows);
  }

  private async fetchFamilyRows(): Promise<Product[]> {
    const rows: Product[] = [];
    let cursor: string | undefined;
    while (rows.length < CATALOG_LIMIT) {
      const { data, error } = await this.supabase.client.rpc('catalog_cache_families', {
        p_after_product_id: cursor,
        p_limit: CATALOG_PAGE_SIZE,
      });
      if (error) throw error;
      const page = (data ?? []) as Product[];
      rows.push(...page);
      if (page.length < CATALOG_PAGE_SIZE) break;
      cursor = page.at(-1)?.id;
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }

  private subscribeChannel(): void {
    if (this.channel) {
      void this.supabase.client.removeChannel(this.channel);
      this.channel = null;
    }
    if (!this.companyId || !this.scope) return;
    const subscribedScope = this.scope;
    this.handler = {
      apply: changes =>
        this.enqueueMutation(() => this.applyJournalChanges(changes, subscribedScope)),
      reset: () => this.refresh(subscribedScope),
    };
    this.channel = this.journal.subscribe(
      'catalog',
      this.scope,
      this.companyId,
      this.handler,
      'catalog-cache'
    );
  }

  private async applyJournalChanges(
    changes: readonly CacheChange[],
    expectedScope: string
  ): Promise<void> {
    const scope = this.scope;
    const locationId = this.locations.activeId();
    if (!scope || scope !== expectedScope || !locationId || !this.connectivity.online()) {
      throw new Error('cache_scope_changed');
    }

    const relevant = changes.filter(
      change => !change.locationId || change.locationId === locationId
    );
    if (!relevant.length) return;

    const variantIds = new Set<string>();
    const metadataVariantIds = new Set<string>();
    const productIds = new Set<string>();
    const familyIds = new Set<string>();
    let referencesChanged = false;
    for (const change of relevant) {
      if (change.entityType === 'variant') {
        variantIds.add(change.entityId);
        metadataVariantIds.add(change.entityId);
      }
      if (change.entityType === 'stock') variantIds.add(change.entityId);
      if (change.entityType === 'product') {
        productIds.add(change.entityId);
        familyIds.add(change.entityId);
      }
      if (change.entityType === 'product_collection') {
        familyIds.add(change.entityId);
        referencesChanged = true;
      }
      if (change.entityType === 'manufacturer' || change.entityType === 'collection') {
        referencesChanged = true;
      }
    }

    // A deleted/deactivated variant no longer tells us its family on the server.
    // Track that family separately: a stock or variant change should fetch only
    // the affected variant, not every sibling variant in the family.
    for (const row of this.catalog()) {
      if (row.variant_id && metadataVariantIds.has(row.variant_id) && row.product_id) {
        familyIds.add(row.product_id);
      }
    }

    const { data, error } = await this.supabase.client.rpc('catalog_cache_entities', {
      p_variant_ids: [...variantIds],
      p_product_ids: [...productIds],
    });
    if (error) throw error;
    const patched = (data ?? []) as unknown as Variant[];
    for (const row of patched) if (row.product_id) familyIds.add(row.product_id);

    const stockPatch = new Map<string, { stock: number; stock_value: number }>();
    const patchedIds = patched.flatMap(row => (row.variant_id ? [row.variant_id] : []));
    for (let start = 0; start < patchedIds.length; start += 1_000) {
      const { data: stockRows, error: stockError } = await this.supabase.client.rpc(
        'location_stock_for_variants',
        { p_location_id: locationId, p_variant_ids: patchedIds.slice(start, start + 1_000) }
      );
      if (stockError) throw stockError;
      for (const row of stockRows ?? []) {
        if (row.variant_id) {
          stockPatch.set(row.variant_id, {
            stock: Number(row.stock ?? 0),
            stock_value: row.stock_value ?? 0,
          });
        }
      }
    }

    const affectedVariants = new Set(variantIds);
    for (const id of patchedIds) affectedVariants.add(id);
    for (const row of this.catalog()) {
      if (row.variant_id && row.product_id && productIds.has(row.product_id)) {
        affectedVariants.add(row.variant_id);
      }
    }
    let nextCatalog = this.catalog().filter(
      row => !affectedVariants.has(row.variant_id!) && !productIds.has(row.product_id!)
    );
    nextCatalog.push(
      ...patched.map(row => ({ ...row, stock: stockPatch.get(row.variant_id!)?.stock ?? 0 }))
    );
    nextCatalog = this.sortVariants(nextCatalog);

    let nextFamilies = this.families().filter(row => !familyIds.has(row.id));
    if (familyIds.size) {
      const { data: families, error: familyError } = await this.supabase.client
        .from('products')
        .select('*')
        .in('id', [...familyIds])
        .eq('active', true);
      if (familyError) throw familyError;
      nextFamilies.push(...(families ?? []));
      nextFamilies.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    }

    let manufacturers = this.manufacturers();
    let collections = this.collections();
    if (referencesChanged) {
      [manufacturers, collections] = await Promise.all([
        this.pos.listManufacturers(),
        this.pos.listCollections(),
      ]);
      const manufacturerNames = new Map(manufacturers.map(item => [item.id, item.name]));
      nextCatalog = nextCatalog.map(row => ({
        ...row,
        manufacturer_name: row.manufacturer_id
          ? (manufacturerNames.get(row.manufacturer_id) ?? null)
          : null,
      }));
    }

    const nextStock = new Map(this.stock());
    for (const id of affectedVariants) nextStock.delete(id);
    for (const [id, value] of stockPatch) nextStock.set(id, value);
    const identity = this.supabase.offlineIdentity();
    if (!identity || scope !== this.scope) throw new Error('cache_scope_changed');
    const snapshot: ProductSnapshot = {
      key: scope,
      company_id: identity.companyId,
      user_id: identity.userId,
      location_id: locationId,
      products: nextCatalog,
      families: nextFamilies,
      location_stock: [...nextStock].map(([variant_id, value]) => ({ variant_id, ...value })),
      manufacturers: this.mergeManufacturers(manufacturers, nextCatalog),
      collections,
      truncated: false,
      fetched_at: new Date().toISOString(),
    };
    await this.persistPatch(snapshot, affectedVariants, familyIds.size > 0 || referencesChanged);
    if (scope !== this.scope) throw new Error('cache_scope_changed');
    this.applySnapshot(snapshot);
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
    this.revision.update(value => value + 1);
  }

  private async fetchLocationStock(
    locationId: string,
    variantIds: string[]
  ): Promise<Array<{ variant_id: string; stock: number; stock_value: number }>> {
    const pages: string[][] = [];
    for (let start = 0; start < variantIds.length; start += 1_000) {
      pages.push(variantIds.slice(start, start + 1_000));
    }
    const results = await Promise.all(
      pages.map(ids =>
        this.supabase.client.rpc('location_stock_for_variants', {
          p_location_id: locationId,
          p_variant_ids: ids,
        })
      )
    );
    return results.flatMap(result => {
      if (result.error) throw result.error;
      return (result.data ?? []).map(row => ({
        variant_id: row.variant_id!,
        stock: Number(row.stock ?? 0),
        stock_value: row.stock_value ?? 0,
      }));
    });
  }

  private reset(): void {
    this.handler = null;
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

  private sortVariants(rows: Variant[]): Variant[] {
    return rows.sort(
      (a, b) =>
        (a.product_name ?? '').localeCompare(b.product_name ?? '') ||
        (a.variant_name ?? '').localeCompare(b.variant_name ?? '') ||
        (a.variant_id ?? '').localeCompare(b.variant_id ?? '')
    );
  }

  private async readSnapshot(scope: string): Promise<ProductSnapshot | null> {
    const db = await offlineDb();
    const metadata = await db.get('catalogMetadata', scope);
    if (metadata) {
      const entries = await db.getAllFromIndex('catalogVariants', 'by-scope', scope);
      const manufacturerNames = new Map(metadata.manufacturers.map(item => [item.id, item.name]));
      const products = this.sortVariants(
        entries.map(entry => ({
          ...entry.variant,
          stock: entry.variant.stock ?? 0,
          manufacturer_name: entry.variant.manufacturer_id
            ? (manufacturerNames.get(entry.variant.manufacturer_id) ?? null)
            : null,
        }))
      );
      return {
        key: scope,
        company_id: metadata.company_id,
        user_id: metadata.user_id,
        location_id: metadata.location_id!,
        products,
        families: metadata.families,
        location_stock: entries.map(entry => ({
          variant_id: entry.variant_id,
          stock: Number(entry.variant.stock ?? 0),
          stock_value: entry.stock_value,
        })),
        manufacturers: metadata.manufacturers,
        collections: metadata.collections,
        truncated: metadata.truncated,
        fetched_at: metadata.fetched_at,
      };
    }

    // One-time migration from the pre-v6 monolithic snapshot. The database
    // reset marker will still perform an authoritative refresh when online.
    const legacy = await db.get('products', scope);
    if (!legacy?.families || !legacy.location_stock) return null;
    await this.enqueueMutation(() => this.replaceSnapshot(legacy));
    return legacy;
  }

  private enqueueMutation<T>(work: () => Promise<T>): Promise<T> {
    const next = this.mutationTail.then(work, work);
    this.mutationTail = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  private async replaceSnapshot(snapshot: ProductSnapshot): Promise<void> {
    const db = await offlineDb();
    const tx = db.transaction(['products', 'catalogVariants', 'catalogMetadata'], 'readwrite');
    const variants = tx.objectStore('catalogVariants');
    const writes: Array<Promise<unknown>> = [];
    let cursor = await variants.index('by-scope').openKeyCursor(snapshot.key);
    while (cursor) {
      await variants.delete(cursor.primaryKey);
      cursor = await cursor.continue();
    }
    const stock = new Map((snapshot.location_stock ?? []).map(row => [row.variant_id, row]));
    for (const variant of snapshot.products) {
      if (!variant.variant_id) continue;
      const record: CatalogVariantRecord = {
        key: `${snapshot.key}:${variant.variant_id}`,
        scope_key: snapshot.key,
        company_id: snapshot.company_id,
        user_id: snapshot.user_id,
        location_id: snapshot.location_id,
        variant_id: variant.variant_id,
        variant,
        stock_value: stock.get(variant.variant_id)?.stock_value ?? 0,
      };
      writes.push(variants.put(record));
    }
    const metadata: CatalogMetadata = {
      key: snapshot.key,
      company_id: snapshot.company_id,
      user_id: snapshot.user_id,
      location_id: snapshot.location_id,
      families: snapshot.families ?? [],
      manufacturers: snapshot.manufacturers ?? [],
      collections: snapshot.collections ?? [],
      truncated: snapshot.truncated ?? false,
      fetched_at: snapshot.fetched_at,
    };
    writes.push(tx.objectStore('catalogMetadata').put(metadata));
    writes.push(tx.objectStore('products').delete(snapshot.key));
    await Promise.all(writes);
    await tx.done;
  }

  private async persistPatch(
    snapshot: ProductSnapshot,
    affectedVariantIds: ReadonlySet<string>,
    metadataChanged: boolean
  ): Promise<void> {
    const db = await offlineDb();
    const currentMetadata = await db.get('catalogMetadata', snapshot.key);
    if (!currentMetadata) throw new Error('catalog_cache_missing');
    const tx = db.transaction(['catalogVariants', 'catalogMetadata'], 'readwrite');
    const variants = tx.objectStore('catalogVariants');
    const writes: Array<Promise<unknown>> = [];
    for (const id of affectedVariantIds) writes.push(variants.delete(`${snapshot.key}:${id}`));
    const stock = new Map((snapshot.location_stock ?? []).map(row => [row.variant_id, row]));
    for (const variant of snapshot.products.filter(
      row => !!row.variant_id && affectedVariantIds.has(row.variant_id)
    )) {
      if (!variant.variant_id) continue;
      const record: CatalogVariantRecord = {
        key: `${snapshot.key}:${variant.variant_id}`,
        scope_key: snapshot.key,
        company_id: snapshot.company_id,
        user_id: snapshot.user_id,
        location_id: snapshot.location_id,
        variant_id: variant.variant_id,
        variant,
        stock_value: stock.get(variant.variant_id)?.stock_value ?? 0,
      };
      writes.push(variants.put(record));
    }
    if (metadataChanged) {
      const metadata: CatalogMetadata = {
        ...currentMetadata,
        families: snapshot.families ?? [],
        manufacturers: snapshot.manufacturers ?? [],
        collections: snapshot.collections ?? [],
        truncated: snapshot.truncated ?? false,
        fetched_at: snapshot.fetched_at,
      };
      writes.push(tx.objectStore('catalogMetadata').put(metadata));
    }
    await Promise.all(writes);
    await tx.done;
  }

  private async persistCurrent(variantId: string): Promise<void> {
    const scope = this.scope;
    if (!scope || !this.loaded()) return;
    const db = await offlineDb();
    const row = this.catalog().find(item => item.variant_id === variantId);
    if (!row?.variant_id || scope !== this.scope) return;
    const stock = this.stock().get(row.variant_id);
    const identity = this.supabase.offlineIdentity();
    const locationId = this.locations.activeId();
    if (!identity || !locationId) return;
    await db.put('catalogVariants', {
      key: `${scope}:${row.variant_id}`,
      scope_key: scope,
      company_id: identity.companyId,
      user_id: identity.userId,
      location_id: locationId,
      variant_id: row.variant_id,
      variant: row,
      stock_value: stock?.stock_value ?? 0,
    });
  }
}
