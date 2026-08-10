import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { ConnectivityService } from '../pos/offline/connectivity.service';
import {
  offlineDb,
  offlineScopeKey,
  type RecentSalesSnapshot,
  type SaleDetailSnapshot,
} from '../pos/offline/offline-db';
import type { OrderWithCustomer } from '../pos/pos.service';
import {
  CacheJournalService,
  type CacheChange,
  type CacheStreamHandler,
} from './cache-journal.service';
import { LocationContextService } from './location-context.service';
import { SupabaseService } from './supabase.service';
import { postgrestIdBatches } from './postgrest-batches';

const RECENT_SALES_LIMIT = 100;
const DETAIL_LIMIT = 20;

@Injectable({ providedIn: 'root' })
export class RecentSalesCacheService {
  private readonly supabase = inject(SupabaseService);
  private readonly locations = inject(LocationContextService);
  private readonly connectivity = inject(ConnectivityService);
  private readonly journal = inject(CacheJournalService);

  readonly orders = signal<OrderWithCustomer[]>([]);
  readonly loaded = signal(false);
  readonly revision = signal(0);

  private scope: string | null = null;
  private companyId: string | null = null;
  private channel: RealtimeChannel | null = null;
  private handler: CacheStreamHandler | null = null;
  private readonly refreshes = new Map<string, Promise<boolean>>();

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
          this.subscribe();
          if (scope) void this.ensureLoaded();
        }
        if (online && scope && this.handler) {
          void this.journal.reconcile('sales', scope, this.handler, 'recent-sales');
        }
      });
    });
  }

  async ensureLoaded(): Promise<boolean> {
    const scope = this.scope;
    if (!scope) return false;
    const cached = await (await offlineDb()).get('recentSales', scope);
    if (cached && scope === this.scope && !this.loaded()) this.applySnapshot(cached);
    if (!cached && this.connectivity.online()) return this.refresh(scope);
    return !!cached;
  }

  refresh(expectedScope: string | null = this.scope): Promise<boolean> {
    if (!expectedScope) return Promise.resolve(false);
    const active = this.refreshes.get(expectedScope);
    if (active) return active;
    const run = async (): Promise<boolean> => {
      const identity = this.supabase.offlineIdentity();
      const locationId = this.locations.activeId();
      const currentScope = identity ? offlineScopeKey(identity, locationId) : null;
      if (
        !identity ||
        !locationId ||
        currentScope !== expectedScope ||
        this.scope !== expectedScope ||
        !this.connectivity.online()
      ) {
        return false;
      }
      const { data, error } = await this.supabase.client
        .from('orders')
        .select('*, customers(first_name, last_name)')
        .eq('location_id', locationId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(RECENT_SALES_LIMIT);
      if (error) throw error;
      if (expectedScope !== this.scope) return false;
      const snapshot: RecentSalesSnapshot = {
        key: expectedScope,
        company_id: identity.companyId,
        user_id: identity.userId,
        location_id: locationId,
        orders: data ?? [],
        fetched_at: new Date().toISOString(),
      };
      await (await offlineDb()).put('recentSales', snapshot);
      if (expectedScope !== this.scope) return false;
      this.applySnapshot(snapshot);
      return true;
    };
    const refresh = run().finally(() => {
      if (this.refreshes.get(expectedScope) === refresh) this.refreshes.delete(expectedScope);
    });
    this.refreshes.set(expectedScope, refresh);
    return refresh;
  }

  async detail<T>(orderId: string): Promise<T | null> {
    const scope = this.scope;
    if (!scope) return null;
    const row = await (await offlineDb()).get('saleDetails', `${scope}:${orderId}`);
    return scope === this.scope ? ((row?.detail as T | undefined) ?? null) : null;
  }

  async rememberDetail(orderId: string, detail: unknown): Promise<void> {
    const identity = this.supabase.offlineIdentity();
    const locationId = this.locations.activeId();
    const scope = this.scope;
    if (!identity || !locationId || !scope) return;
    const db = await offlineDb();
    const row: SaleDetailSnapshot = {
      key: `${scope}:${orderId}`,
      scope_key: scope,
      order_id: orderId,
      company_id: identity.companyId,
      user_id: identity.userId,
      location_id: locationId,
      detail,
      opened_at: new Date().toISOString(),
    };
    await db.put('saleDetails', row);
    const keys = await db.getAllKeysFromIndex(
      'saleDetails',
      'by-scope-opened',
      IDBKeyRange.bound([scope, ''], [scope, '\uffff'])
    );
    for (const key of keys.slice(0, Math.max(0, keys.length - DETAIL_LIMIT))) {
      await db.delete('saleDetails', key);
    }
  }

  private subscribe(): void {
    if (this.channel) void this.supabase.client.removeChannel(this.channel);
    this.channel = null;
    if (!this.companyId || !this.scope) return;
    this.handler = {
      apply: changes => this.applyChanges(changes),
      reset: () => this.resetStream(),
      purge: () => this.clearState(),
    };
    this.channel = this.journal.subscribe(
      'sales',
      this.scope,
      this.companyId,
      this.handler,
      'recent-sales'
    );
  }

  private async applyChanges(changes: readonly CacheChange[]): Promise<void> {
    const scope = this.scope;
    const locationId = this.locations.activeId();
    if (!scope || !locationId) throw new Error('cache_scope_changed');
    const relevant = changes.filter(
      change => !change.locationId || change.locationId === locationId
    );
    const ids = [...new Set(relevant.map(change => change.entityId))];
    if (!ids.length) return;
    if (relevant.some(change => change.operation === 'delete')) {
      await this.clearDetails(scope, ids);
      if (!(await this.refresh(scope))) throw new Error('sales_refresh_failed');
      return;
    }
    const changedRows: OrderWithCustomer[] = [];
    for (const batch of postgrestIdBatches(ids)) {
      const { data, error } = await this.supabase.client
        .from('orders')
        .select('*, customers(first_name, last_name)')
        .in('id', batch)
        .eq('location_id', locationId);
      if (error) throw error;
      changedRows.push(...(data ?? []));
    }
    const changed = new Map(changedRows.map(row => [row.id, row]));
    const idSet = new Set(ids);
    const rows = this.orders().filter(row => !idSet.has(row.id));
    rows.push(...changed.values());
    rows.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));

    const existing = await (await offlineDb()).get('recentSales', scope);
    if (!existing || scope !== this.scope) throw new Error('cache_scope_changed');
    await this.clearDetails(scope, ids);
    const snapshot: RecentSalesSnapshot = {
      ...existing,
      orders: rows.slice(0, RECENT_SALES_LIMIT),
      fetched_at: new Date().toISOString(),
    };
    await (await offlineDb()).put('recentSales', snapshot);
    if (scope !== this.scope) throw new Error('cache_scope_changed');
    this.applySnapshot(snapshot);
  }

  private async resetStream(): Promise<boolean> {
    const scope = this.scope;
    if (!scope) return false;
    await this.clearDetails(scope);
    return this.refresh(scope);
  }

  private async clearDetails(scope: string, orderIds?: readonly string[]): Promise<void> {
    const db = await offlineDb();
    if (orderIds) {
      await Promise.all(orderIds.map(id => db.delete('saleDetails', `${scope}:${id}`)));
      return;
    }
    const keys = await db.getAllKeysFromIndex(
      'saleDetails',
      'by-scope-opened',
      IDBKeyRange.bound([scope, ''], [scope, '\uffff'])
    );
    await Promise.all(keys.map(key => db.delete('saleDetails', key)));
  }

  private applySnapshot(snapshot: RecentSalesSnapshot): void {
    this.orders.set(snapshot.orders);
    this.loaded.set(true);
    this.revision.update(value => value + 1);
  }

  private reset(): void {
    this.handler = null;
    this.clearState();
  }

  private clearState(): void {
    this.orders.set([]);
    this.loaded.set(false);
    this.revision.update(value => value + 1);
  }
}
