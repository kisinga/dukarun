import { Injectable, computed, inject, signal } from '@angular/core';
import type { Database } from '@dukarun/shared-types';
import { TeamService } from '../team/team.service';
import { ConnectivityService } from '../pos/offline/connectivity.service';
import type { Variant } from '../pos/pos.service';
import {
  CacheBackedLookupEngine,
  type CacheLookupDiagnostics,
  type CacheLookupRequest,
  type CacheLookupResult,
} from './cache-backed-lookup';
import { CatalogCacheService } from './catalog-cache.service';
import { LocationContextService, type BusinessLocation } from './location-context.service';
import { PartyCacheService } from './party-cache.service';
import { RecentSalesCacheService } from './recent-sales-cache.service';
import { SupabaseService } from './supabase.service';

export type IdentityResolution = 'resolved' | 'unresolved';

export type CatalogIdentity = Pick<
  Variant,
  | 'variant_id'
  | 'company_id'
  | 'product_id'
  | 'product_name'
  | 'variant_name'
  | 'kind'
  | 'sku'
  | 'stock_unit'
  | 'variant_active'
  | 'product_active'
  | 'manufacturer_id'
  | 'manufacturer_name'
>;

export interface PartyIdentity {
  id: string;
  name: string;
  phone: string | null;
  deleted: boolean;
  kind: 'customer' | 'supplier';
}

export interface StaffIdentity {
  userId: string;
  displayName: string;
  roleName: string | null;
}

export interface OrderIdentity {
  id: string;
  code: string;
}

type StaffProfile = Pick<
  Database['public']['Tables']['company_staff_profiles']['Row'],
  'user_id' | 'display_name' | 'last_role_name'
>;

/**
 * Cache-first product identity. Stock and commercial values remain server-authoritative.
 * Active coverage is intentionally cache-only; above CatalogCacheService's hard 10k
 * retention ceiling, omitted active identities resolve as unavailable for now.
 */
@Injectable({ providedIn: 'root' })
export class CatalogIdentityLookupService {
  private readonly cache = inject(CatalogCacheService);
  private readonly connectivity = inject(ConnectivityService);
  private readonly locations = inject(LocationContextService);
  private readonly supabase = inject(SupabaseService);
  readonly diagnostics = signal<CacheLookupDiagnostics | null>(null);

  private readonly engine = new CacheBackedLookupEngine<CatalogIdentity>({
    snapshot: () => ({
      scope: this.scope(this.locations.activeId()),
      revision: this.cache.revision(),
      items: this.cache.getCatalog(),
      complete: this.cache.loaded() && !this.cache.catalogTruncated(),
      stale: !this.cache.loaded(),
    }),
    id: item => item.variant_id,
    enrichHistoricalByIds: async ids => {
      if (!this.connectivity.online()) return [];
      const { data, error } = await this.supabase.client.rpc('catalog_identity_lookup', {
        p_variant_ids: [...ids],
      });
      if (error) throw error;
      return data ?? [];
    },
    batchSize: 100,
  });

  peek(ids: readonly string[]): CacheLookupResult<CatalogIdentity> {
    const result = this.engine.peek(ids);
    this.diagnostics.set(result.diagnostics);
    return result;
  }

  async resolve(
    ids: readonly string[],
    request: CacheLookupRequest
  ): Promise<CacheLookupResult<CatalogIdentity>> {
    if (!ids.some(id => id.trim())) return this.peek(ids);
    if (!this.cache.loaded()) {
      const restored = await this.cache.ensureLoaded();
      // A first-time scope has no IndexedDB snapshot. ensureLoaded starts the
      // shared refresh without awaiting it; join that refresh so static view
      // models are not hydrated from a transiently empty catalog.
      if (!restored && this.connectivity.online()) await this.cache.refresh();
    }
    const result = await this.engine.resolve(ids, request);
    this.diagnostics.set(result.diagnostics);
    return result;
  }

  private scope(locationId: string | null): string | null {
    const identity = this.supabase.offlineIdentity();
    return identity ? `${identity.companyId}:${identity.userId}:${locationId ?? 'none'}` : null;
  }
}

/** Wraps PartyCacheService public signals without changing its high-risk internals. */
@Injectable({ providedIn: 'root' })
export class PartyIdentityLookupService {
  private readonly cache = inject(PartyCacheService);
  private readonly connectivity = inject(ConnectivityService);
  private readonly supabase = inject(SupabaseService);
  readonly diagnostics = signal<CacheLookupDiagnostics | null>(null);

  private readonly customerRows = computed<PartyIdentity[]>(() =>
    this.cache.customers().map(row => ({
      id: row.id,
      name: [row.first_name, row.last_name].filter(Boolean).join(' '),
      phone: row.phone,
      deleted: row.deleted_at !== null,
      kind: 'customer',
    }))
  );
  private readonly supplierRows = computed<PartyIdentity[]>(() =>
    this.cache.suppliers().map(row => ({
      id: row.id,
      name: [row.first_name, row.last_name].filter(Boolean).join(' '),
      phone: row.phone,
      deleted: row.deleted_at !== null,
      kind: 'supplier',
    }))
  );
  private readonly customers = this.createEngine('customer', this.customerRows);
  private readonly suppliers = this.createEngine('supplier', this.supplierRows);

  async resolveCustomers(
    ids: readonly string[],
    request: CacheLookupRequest
  ): Promise<CacheLookupResult<PartyIdentity>> {
    if (!ids.some(id => id.trim())) return this.record(this.customers.peek(ids));
    if (!this.cache.loaded()) await this.cache.ensureLoaded();
    return this.record(await this.customers.resolve(ids, request));
  }

  async resolveSuppliers(
    ids: readonly string[],
    request: CacheLookupRequest
  ): Promise<CacheLookupResult<PartyIdentity>> {
    if (!ids.some(id => id.trim())) return this.record(this.suppliers.peek(ids));
    if (!this.cache.loaded()) await this.cache.ensureLoaded();
    return this.record(await this.suppliers.resolve(ids, request));
  }

  private createEngine(
    kind: PartyIdentity['kind'],
    rows: () => readonly PartyIdentity[]
  ): CacheBackedLookupEngine<PartyIdentity> {
    return new CacheBackedLookupEngine<PartyIdentity>({
      snapshot: () => ({
        scope: this.scope(),
        revision: this.cache.revision(),
        items: rows(),
        complete: this.cache.loaded() && this.cache.complete(),
        stale: !this.cache.loaded(),
      }),
      id: item => item.id,
      enrichHistoricalByIds: async ids => {
        if (!this.connectivity.online()) return [];
        const { data, error } = await this.supabase.client
          .from('customers')
          .select('id, first_name, last_name, phone, deleted_at')
          .eq('is_supplier', kind === 'supplier')
          .in('id', [...ids]);
        if (error) throw error;
        return (data ?? []).map(row => ({
          id: row.id,
          name: [row.first_name, row.last_name].filter(Boolean).join(' '),
          phone: row.phone,
          deleted: row.deleted_at !== null,
          kind,
        }));
      },
    });
  }

  private record(result: CacheLookupResult<PartyIdentity>): CacheLookupResult<PartyIdentity> {
    this.diagnostics.set(result.diagnostics);
    return result;
  }

  private scope(): string | null {
    const identity = this.supabase.offlineIdentity();
    return identity ? `${identity.companyId}:${identity.userId}` : null;
  }
}

@Injectable({ providedIn: 'root' })
export class StaffIdentityLookupService {
  private readonly connectivity = inject(ConnectivityService);
  private readonly supabase = inject(SupabaseService);
  private readonly team = inject(TeamService);

  private readonly rows = computed<StaffIdentity[]>(() =>
    this.team.members().map(member => ({
      userId: member.user_id,
      displayName: member.staff_profile?.display_name || member.user_id,
      roleName: member.roles?.name ?? member.staff_profile?.last_role_name ?? null,
    }))
  );
  private readonly engine = new CacheBackedLookupEngine<StaffIdentity>({
    snapshot: () => ({
      scope: this.scope(),
      revision: this.team.members(),
      items: this.rows(),
      complete: false,
      stale: false,
    }),
    id: item => item.userId,
    enrichHistoricalByIds: async ids => {
      if (!this.connectivity.online()) return [];
      const { data, error } = await this.supabase.client
        .from('company_staff_profiles')
        .select('user_id, display_name, last_role_name')
        .in('user_id', [...ids]);
      if (error) throw error;
      return ((data ?? []) as StaffProfile[]).map(row => ({
        userId: row.user_id,
        displayName: row.display_name,
        roleName: row.last_role_name,
      }));
    },
  });

  resolve(
    ids: readonly string[],
    request: CacheLookupRequest
  ): Promise<CacheLookupResult<StaffIdentity>> {
    return this.engine.resolve(ids, request);
  }

  private scope(): string | null {
    const identity = this.supabase.offlineIdentity();
    return identity ? `${identity.companyId}:${identity.userId}` : null;
  }
}

@Injectable({ providedIn: 'root' })
export class LocationIdentityLookupService {
  private readonly locations = inject(LocationContextService);
  private readonly supabase = inject(SupabaseService);
  private readonly engine = new CacheBackedLookupEngine<BusinessLocation>({
    snapshot: () => ({
      scope: this.scope(),
      revision: this.locations.locations(),
      items: this.locations.locations(),
      complete: this.locations.locations().length > 0,
      stale: this.locations.loading(),
    }),
    id: item => item.id,
  });

  async resolve(
    ids: readonly string[],
    request: CacheLookupRequest
  ): Promise<CacheLookupResult<BusinessLocation>> {
    if (!ids.some(id => id.trim())) return this.engine.peek(ids);
    await this.locations.load();
    return this.engine.resolve(ids, request);
  }

  private scope(): string | null {
    const identity = this.supabase.offlineIdentity();
    return identity ? `${identity.companyId}:${identity.userId}` : null;
  }
}

@Injectable({ providedIn: 'root' })
export class OrderIdentityLookupService {
  private readonly recent = inject(RecentSalesCacheService);
  private readonly connectivity = inject(ConnectivityService);
  private readonly locations = inject(LocationContextService);
  private readonly supabase = inject(SupabaseService);
  private readonly rows = computed<OrderIdentity[]>(() =>
    this.recent.orders().map(order => ({ id: order.id, code: order.code }))
  );
  private readonly engine = new CacheBackedLookupEngine<OrderIdentity>({
    snapshot: () => ({
      scope: this.scope(),
      revision: this.recent.revision(),
      items: this.rows(),
      complete: false,
      stale: !this.recent.loaded(),
    }),
    id: item => item.id,
    enrichHistoricalByIds: async ids => {
      if (!this.connectivity.online()) return [];
      const { data, error } = await this.supabase.client
        .from('orders')
        .select('id, code')
        .in('id', [...ids]);
      if (error) throw error;
      return data ?? [];
    },
  });

  async resolve(
    ids: readonly string[],
    request: CacheLookupRequest
  ): Promise<CacheLookupResult<OrderIdentity>> {
    if (!ids.some(id => id.trim())) return this.engine.peek(ids);
    if (!this.recent.loaded()) await this.recent.ensureLoaded();
    return this.engine.resolve(ids, request);
  }

  private scope(): string | null {
    const identity = this.supabase.offlineIdentity();
    return identity
      ? `${identity.companyId}:${identity.userId}:${this.locations.activeId() ?? 'none'}`
      : null;
  }
}
