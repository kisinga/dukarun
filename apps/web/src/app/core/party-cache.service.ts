import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Database } from '@dukarun/shared-types';
import { ConnectivityService } from '../pos/offline/connectivity.service';
import {
  offlineDb,
  offlineScopeKey,
  type CachedCustomer,
  type CachedSupplier,
  type PartySnapshot,
} from '../pos/offline/offline-db';
import { SupabaseService } from './supabase.service';
import {
  CacheJournalService,
  type CacheChange,
  type CacheStreamHandler,
} from './cache-journal.service';

type Customer = Database['public']['Tables']['customers']['Row'];
type CustomerBalance = Database['public']['Views']['customer_ar_balances']['Row'];
type SupplierBalance = Database['public']['Views']['supplier_ap_balances']['Row'];
type CustomerAging = Pick<
  Database['public']['Views']['customer_credit_aging']['Row'],
  'customer_id' | 'days_outstanding' | 'bucket'
>;
type SupplierAging = Pick<
  Database['public']['Views']['supplier_ap_aging']['Row'],
  'supplier_id' | 'days_outstanding' | 'bucket'
>;

interface FinancialProjection {
  ar: Map<string | null, number>;
  ap: Map<string | null, number>;
  arAging: Map<string, CustomerAging>;
  apAging: Map<string, SupplierAging>;
}

export interface PartyQueryResult<T> {
  items: T[];
  /** True only when the returned limit contains every possible match. */
  exhaustive: boolean;
  stale: boolean;
  hasMore: boolean;
  source: 'cache' | 'server';
}

const PAGE_SIZE = 500;
const PARTY_RETENTION_LIMIT = 5_000;
const SEARCH_LIMIT = 10;

/**
 * Company-wide customer/supplier directory cache.
 *
 * Collection completeness belongs here: consumers never interpret an empty
 * partial-cache result as authoritative absence. Financial projections carry
 * separate freshness because they change more often than party identity.
 */
@Injectable({ providedIn: 'root' })
export class PartyCacheService {
  private readonly supabase = inject(SupabaseService);
  private readonly connectivity = inject(ConnectivityService);
  private readonly journal = inject(CacheJournalService);

  readonly customers = signal<CachedCustomer[]>([]);
  readonly suppliers = signal<CachedSupplier[]>([]);
  readonly complete = signal(false);
  readonly loaded = signal(false);
  readonly directoryFetchedAt = signal<string | null>(null);
  readonly financialFetchedAt = signal<string | null>(null);
  readonly revision = signal(0);

  private scope: string | null = null;
  private companyId: string | null = null;
  private channel: RealtimeChannel | null = null;
  private refreshPromise: Promise<boolean> | null = null;
  private invalidated = false;
  private financialInvalidated = false;
  private handler: CacheStreamHandler | null = null;

  constructor() {
    effect(() => {
      const identity = this.supabase.offlineIdentity();
      const online = this.connectivity.online();
      this.connectivity.resumeTick();
      untracked(() => {
        const scope = identity ? offlineScopeKey(identity) : null;
        if (scope !== this.scope) {
          this.scope = scope;
          this.companyId = identity?.companyId ?? null;
          this.reset();
          this.subscribeChannel();
          if (scope) void this.ensureLoaded();
        }
        if (online && scope && this.handler) {
          void this.journal.reconcile('parties', scope, this.handler, 'party-cache');
        }
      });
    });
  }

  async ensureLoaded(): Promise<boolean> {
    const requestedScope = this.scope;
    if (!requestedScope) return false;
    if (!this.loaded()) {
      const snapshot = await (await offlineDb()).get('parties', requestedScope);
      if (this.scope !== requestedScope) return false;
      if (snapshot) this.applySnapshot(snapshot);
    }
    if (this.connectivity.online() && !this.loaded()) return this.refresh();
    if (
      this.connectivity.online() &&
      (this.invalidated || this.financialInvalidated) &&
      this.handler
    )
      await this.journal.reconcile('parties', requestedScope, this.handler, 'party-cache');
    return this.loaded();
  }

  refresh(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.fetchSnapshot().finally(() => (this.refreshPromise = null));
    return this.refreshPromise;
  }

  /** Mark derived and directory rows stale after a successful RPC mutation. */
  invalidate(): void {
    this.invalidated = true;
    if (this.connectivity.online() && this.scope && this.handler)
      void this.journal.reconcile('parties', this.scope, this.handler, 'party-cache');
  }

  invalidateFinancials(): void {
    this.financialInvalidated = true;
    if (this.connectivity.online() && this.scope && this.handler)
      void this.journal.reconcile('parties', this.scope, this.handler, 'party-cache');
  }

  customerRows(includeDeleted = false): CachedCustomer[] {
    const rows = this.customers();
    return includeDeleted ? rows : rows.filter(row => row.deleted_at === null);
  }

  async searchCustomers(
    query: string,
    limit = SEARCH_LIMIT
  ): Promise<PartyQueryResult<CachedCustomer>> {
    await this.ensureLoaded();
    const normalized = normalizeSearch(query);
    const localMatches = this.customerRows().filter(row =>
      partySearchText(row).includes(normalized)
    );
    const stale = this.isFinancialStale();
    if (this.complete() || !this.connectivity.online()) {
      const hasMore = localMatches.length > limit;
      return {
        items: localMatches.slice(0, limit),
        exhaustive: this.complete() && !hasMore,
        stale,
        hasMore,
        source: 'cache',
      };
    }

    const pattern = `%${query.trim().replace(/[%_,()]/g, ' ')}%`;
    const { data, error } = await this.supabase.client
      .from('customers')
      .select('*')
      .eq('is_supplier', false)
      .is('deleted_at', null)
      .or(`first_name.ilike.${pattern},last_name.ilike.${pattern},phone.ilike.${pattern}`)
      .order('first_name')
      .order('id')
      .limit(limit + 1);
    if (error) throw error;
    const rows = await this.withCustomerBalances((data ?? []).slice(0, limit));
    const hasMore = (data?.length ?? 0) > limit;
    return { items: rows, exhaustive: !hasMore, stale: false, hasMore, source: 'server' };
  }

  async customerWithCredit(customerId: string): Promise<CachedCustomer | null> {
    await this.ensureLoaded();
    const cached = this.customers().find(row => row.id === customerId && row.deleted_at === null);
    if (
      (cached && (!this.connectivity.online() || !this.isFinancialStale())) ||
      (!cached && (this.complete() || !this.connectivity.online()))
    ) {
      return cached ?? null;
    }
    const { data, error } = await this.supabase.client
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .eq('is_supplier', false)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return (await this.withCustomerBalances([data]))[0] ?? null;
  }

  private async fetchSnapshot(): Promise<boolean> {
    const identity = this.supabase.offlineIdentity();
    const scope = this.scope;
    if (!identity || !scope || !this.connectivity.online()) return false;
    try {
      const [directory, financials] = await Promise.all([
        this.fetchDirectory(),
        this.fetchFinancialProjection(),
      ]);
      if (scope !== this.scope) return false;
      const now = new Date().toISOString();
      const snapshot: PartySnapshot = {
        key: scope,
        company_id: identity.companyId,
        user_id: identity.userId,
        customers: directory.rows
          .filter(row => !row.is_supplier)
          .map(row => this.customerWithFinancials(row, financials)),
        suppliers: directory.rows
          .filter(row => row.is_supplier)
          .map(row => this.supplierWithFinancials(row, financials)),
        complete: directory.complete,
        directory_fetched_at: now,
        financial_fetched_at: now,
      };
      await (await offlineDb()).put('parties', snapshot);
      if (scope !== this.scope) return false;
      this.applySnapshot(snapshot);
      this.invalidated = false;
      this.financialInvalidated = false;
      return true;
    } catch {
      return false;
    }
  }

  private async fetchFinancialProjection(): Promise<FinancialProjection> {
    const [balances, supplierBalances, customerAging, supplierAging] = await Promise.all([
      this.fetchAllPages<CustomerBalance>(async (from, to) => {
        const { data, error } = await this.supabase.client
          .from('customer_ar_balances')
          .select('*')
          .order('customer_id')
          .range(from, to);
        return { data: data ?? [], error };
      }),
      this.fetchAllPages<SupplierBalance>(async (from, to) => {
        const { data, error } = await this.supabase.client
          .from('supplier_ap_balances')
          .select('*')
          .order('supplier_id')
          .range(from, to);
        return { data: data ?? [], error };
      }),
      this.fetchAllPages<CustomerAging>(async (from, to) => {
        const { data, error } = await this.supabase.client
          .from('customer_credit_aging')
          .select('customer_id, days_outstanding, bucket')
          .order('customer_id')
          .range(from, to);
        return { data: data ?? [], error };
      }),
      this.fetchAllPages<SupplierAging>(async (from, to) => {
        const { data, error } = await this.supabase.client
          .from('supplier_ap_aging')
          .select('supplier_id, days_outstanding, bucket')
          .order('supplier_id')
          .range(from, to);
        return { data: data ?? [], error };
      }),
    ]);
    return {
      ar: new Map(balances.map(row => [row.customer_id, row.balance ?? 0])),
      ap: new Map(supplierBalances.map(row => [row.supplier_id, row.balance ?? 0])),
      arAging: new Map(
        customerAging.filter(row => row.customer_id !== null).map(row => [row.customer_id!, row])
      ),
      apAging: new Map(
        supplierAging.filter(row => row.supplier_id !== null).map(row => [row.supplier_id!, row])
      ),
    };
  }

  private async fetchAllPages<T>(
    loadPage: (
      from: number,
      to: number
    ) => Promise<{ data: T[]; error: { message: string } | null }>
  ): Promise<T[]> {
    const rows: T[] = [];
    while (true) {
      const { data, error } = await loadPage(rows.length, rows.length + PAGE_SIZE - 1);
      if (error) throw error;
      rows.push(...data);
      if (data.length < PAGE_SIZE) return rows;
    }
  }

  private customerWithFinancials(row: Customer, values: FinancialProjection): CachedCustomer {
    return {
      ...row,
      ar_balance: values.ar.get(row.id) ?? 0,
      days_outstanding: values.arAging.get(row.id)?.days_outstanding ?? null,
      bucket: values.arAging.get(row.id)?.bucket ?? null,
    };
  }

  private supplierWithFinancials(row: Customer, values: FinancialProjection): CachedSupplier {
    return {
      ...row,
      ap_balance: values.ap.get(row.id) ?? 0,
      days_outstanding: values.apAging.get(row.id)?.days_outstanding ?? null,
      bucket: values.apAging.get(row.id)?.bucket ?? null,
    };
  }

  private async fetchDirectory(): Promise<{ rows: Customer[]; complete: boolean }> {
    const rows: Customer[] = [];
    let cursor: string | null = null;
    while (rows.length <= PARTY_RETENTION_LIMIT) {
      const requestSize = Math.min(PAGE_SIZE, PARTY_RETENTION_LIMIT + 1 - rows.length);
      let query = this.supabase.client.from('customers').select('*').order('id').limit(requestSize);
      if (cursor) query = query.gt('id', cursor);
      const { data, error } = await query;
      if (error) throw error;
      const page = data ?? [];
      rows.push(...page);
      if (page.length < requestSize) return { rows, complete: true };
      cursor = page.at(-1)!.id;
    }
    return { rows: rows.slice(0, PARTY_RETENTION_LIMIT), complete: false };
  }

  private async withCustomerBalances(customers: Customer[]): Promise<CachedCustomer[]> {
    if (customers.length === 0) return [];
    const { data, error } = await this.supabase.client
      .from('customer_ar_balances')
      .select('customer_id, balance')
      .in(
        'customer_id',
        customers.map(row => row.id)
      );
    if (error) throw error;
    const balances = new Map((data ?? []).map(row => [row.customer_id, row.balance ?? 0]));
    return customers.map(row => ({
      ...row,
      ar_balance: balances.get(row.id) ?? 0,
      days_outstanding: null,
      bucket: null,
    }));
  }

  private subscribeChannel(): void {
    if (this.channel) void this.supabase.client.removeChannel(this.channel);
    this.channel = null;
    if (!this.companyId || !this.scope) return;
    this.handler = {
      apply: changes => this.applyJournalChanges(changes),
      reset: () => this.refresh(),
      purge: () => this.clearState(),
    };
    this.channel = this.journal.subscribe(
      'parties',
      this.scope,
      this.companyId,
      this.handler,
      'party-cache'
    );
  }

  private async applyJournalChanges(changes: readonly CacheChange[]): Promise<void> {
    const scope = this.scope;
    if (!scope || !this.connectivity.online()) throw new Error('cache_scope_changed');
    const ids = [...new Set(changes.map(change => change.entityId))];
    if (!ids.length) return;

    const [directoryResult, arResult, apResult, arAgingResult, apAgingResult] = await Promise.all([
      this.supabase.client.from('customers').select('*').in('id', ids),
      this.supabase.client.from('customer_ar_balances').select('*').in('customer_id', ids),
      this.supabase.client.from('supplier_ap_balances').select('*').in('supplier_id', ids),
      this.supabase.client
        .from('customer_credit_aging')
        .select('customer_id, days_outstanding, bucket')
        .in('customer_id', ids),
      this.supabase.client
        .from('supplier_ap_aging')
        .select('supplier_id, days_outstanding, bucket')
        .in('supplier_id', ids),
    ]);
    for (const result of [directoryResult, arResult, apResult, arAgingResult, apAgingResult]) {
      if (result.error) throw result.error;
    }

    const projection: FinancialProjection = {
      ar: new Map((arResult.data ?? []).map(row => [row.customer_id, row.balance ?? 0])),
      ap: new Map((apResult.data ?? []).map(row => [row.supplier_id, row.balance ?? 0])),
      arAging: new Map(
        (arAgingResult.data ?? [])
          .filter(row => row.customer_id !== null)
          .map(row => [row.customer_id!, row])
      ),
      apAging: new Map(
        (apAgingResult.data ?? [])
          .filter(row => row.supplier_id !== null)
          .map(row => [row.supplier_id!, row])
      ),
    };
    const idSet = new Set(ids);
    let customers = this.customers().filter(row => !idSet.has(row.id));
    let suppliers = this.suppliers().filter(row => !idSet.has(row.id));
    for (const row of directoryResult.data ?? []) {
      if (row.is_supplier) suppliers.push(this.supplierWithFinancials(row, projection));
      else customers.push(this.customerWithFinancials(row, projection));
    }

    const existing = await (await offlineDb()).get('parties', scope);
    if (!existing || scope !== this.scope) throw new Error('cache_scope_changed');
    if (!existing?.complete && customers.length + suppliers.length > PARTY_RETENTION_LIMIT) {
      const retained = new Set(
        [...customers, ...suppliers]
          .sort((a, b) => a.id.localeCompare(b.id))
          .slice(0, PARTY_RETENTION_LIMIT)
          .map(row => row.id)
      );
      customers = customers.filter(row => retained.has(row.id));
      suppliers = suppliers.filter(row => retained.has(row.id));
    }

    const now = new Date().toISOString();
    const snapshot: PartySnapshot = {
      ...existing,
      customers: sortParties(customers),
      suppliers: sortParties(suppliers),
      directory_fetched_at: now,
      financial_fetched_at: now,
    };
    await (await offlineDb()).put('parties', snapshot);
    if (scope !== this.scope) throw new Error('cache_scope_changed');
    this.applySnapshot(snapshot);
    this.invalidated = false;
    this.financialInvalidated = false;
  }

  private applySnapshot(snapshot: PartySnapshot): void {
    this.customers.set(sortParties(snapshot.customers));
    this.suppliers.set(sortParties(snapshot.suppliers));
    this.complete.set(snapshot.complete);
    this.directoryFetchedAt.set(snapshot.directory_fetched_at);
    this.financialFetchedAt.set(snapshot.financial_fetched_at);
    this.loaded.set(true);
    this.revision.update(value => value + 1);
  }

  private isFinancialStale(): boolean {
    return this.financialInvalidated || !this.financialFetchedAt();
  }

  private reset(): void {
    this.handler = null;
    this.clearState();
  }

  private clearState(): void {
    this.customers.set([]);
    this.suppliers.set([]);
    this.complete.set(false);
    this.loaded.set(false);
    this.directoryFetchedAt.set(null);
    this.financialFetchedAt.set(null);
    this.invalidated = false;
    this.financialInvalidated = false;
  }
}

function normalizeSearch(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function partySearchText(row: Pick<Customer, 'first_name' | 'last_name' | 'phone'>): string {
  return normalizeSearch([row.first_name, row.last_name, row.phone].filter(Boolean).join(' '));
}

function sortParties<T extends Pick<Customer, 'first_name' | 'last_name' | 'id'>>(rows: T[]): T[] {
  return rows.sort(
    (a, b) =>
      a.first_name.localeCompare(b.first_name) ||
      (a.last_name ?? '').localeCompare(b.last_name ?? '') ||
      a.id.localeCompare(b.id)
  );
}
