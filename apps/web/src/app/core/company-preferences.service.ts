import { Injectable, effect, signal, untracked } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { LocationContextService } from './location-context.service';
import { offlineDb, offlineScopeKey } from '../pos/offline/offline-db';
import { ConnectivityService } from '../pos/offline/connectivity.service';
import { CacheJournalService, type CacheStreamHandler } from './cache-journal.service';

/** Runtime company switches used outside the Settings screen. */
@Injectable({ providedIn: 'root' })
export class CompanyPreferencesService {
  readonly cashierFlowEnabled = signal(false);
  readonly cashControlEnabled = signal(true);
  readonly requireOpeningCount = signal(true);
  readonly batchExpiryEnabled = signal(false);
  readonly loaded = signal(false);

  private readonly refreshes = new Map<string, Promise<void>>();
  private lastRefreshSucceeded = false;
  private scope: string | null = null;
  private channel: RealtimeChannel | null = null;
  private handler: CacheStreamHandler | null = null;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly locations: LocationContextService,
    private readonly connectivity: ConnectivityService,
    private readonly journal: CacheJournalService
  ) {
    effect(() => {
      const identity = this.supabase.offlineIdentity();
      const locationId = this.locations.activeId();
      const online = this.connectivity.online();
      untracked(() => {
        const scope = identity ? offlineScopeKey(identity, locationId) : null;
        if (scope !== this.scope) {
          if (this.channel) void this.supabase.client.removeChannel(this.channel);
          this.scope = scope;
          this.channel = null;
          this.handler = null;
          this.lastRefreshSucceeded = false;
          this.cashierFlowEnabled.set(false);
          this.cashControlEnabled.set(true);
          this.requireOpeningCount.set(true);
          this.batchExpiryEnabled.set(false);
          this.loaded.set(false);
          if (identity && locationId && scope) void this.start(identity.companyId, scope);
        }
        if (online && scope && this.handler) {
          void this.journal.reconcile('settings', scope, this.handler, 'company-preferences');
        }
      });
    });
  }

  refresh(expectedScope: string | null = this.currentScope()): Promise<void> {
    if (!expectedScope) return Promise.resolve();
    const active = this.refreshes.get(expectedScope);
    if (active) return active;
    const refresh = this.load(expectedScope).finally(() => {
      if (this.refreshes.get(expectedScope) === refresh) this.refreshes.delete(expectedScope);
    });
    this.refreshes.set(expectedScope, refresh);
    return refresh;
  }

  private async load(expectedScope: string): Promise<void> {
    const identity = this.supabase.offlineIdentity();
    const locationId = this.locations.activeId();
    if (!identity || !locationId) return;
    const key = offlineScopeKey(identity, locationId);
    if (key !== expectedScope || this.currentScope() !== expectedScope) return;
    const db = await offlineDb();
    try {
      const { data, error } = await this.supabase.client
        .from('companies')
        .select(
          'cashier_flow_enabled, cash_control_enabled, require_opening_count, batch_expiry_enabled'
        )
        .eq('id', identity.companyId)
        .single();
      if (error) throw error;
      if (this.currentScope() !== expectedScope) return;
      this.lastRefreshSucceeded = true;
      this.cashierFlowEnabled.set(data.cashier_flow_enabled);
      this.cashControlEnabled.set(data.cash_control_enabled);
      this.requireOpeningCount.set(data.require_opening_count);
      this.batchExpiryEnabled.set(data.batch_expiry_enabled);
      const existing = await db.get('settings', key);
      if (this.currentScope() !== expectedScope) return;
      await db.put('settings', {
        ...existing,
        key,
        company_id: identity.companyId,
        user_id: identity.userId,
        location_id: locationId,
        payment_methods: existing?.payment_methods ?? [],
        cashier_flow_enabled: data.cashier_flow_enabled,
        cash_control_enabled: data.cash_control_enabled,
        require_opening_count: data.require_opening_count,
        batch_expiry_enabled: data.batch_expiry_enabled,
        fetched_at: new Date().toISOString(),
      });
    } catch {
      if (this.currentScope() !== expectedScope) return;
      this.lastRefreshSucceeded = false;
      const cached = await db.get('settings', key);
      if (this.currentScope() !== expectedScope) return;
      this.cashierFlowEnabled.set(cached?.cashier_flow_enabled ?? false);
      this.cashControlEnabled.set(cached?.cash_control_enabled ?? true);
      this.requireOpeningCount.set(cached?.require_opening_count ?? true);
      this.batchExpiryEnabled.set(cached?.batch_expiry_enabled ?? false);
    } finally {
      if (this.currentScope() === expectedScope) this.loaded.set(true);
    }
  }

  private async start(companyId: string, scope: string): Promise<void> {
    const cached = await (await offlineDb()).get('settings', scope);
    if (scope !== this.scope || scope !== this.currentScope()) return;
    if (cached) {
      this.cashierFlowEnabled.set(cached.cashier_flow_enabled ?? false);
      this.cashControlEnabled.set(cached.cash_control_enabled ?? true);
      this.requireOpeningCount.set(cached.require_opening_count ?? true);
      this.batchExpiryEnabled.set(cached.batch_expiry_enabled ?? false);
      this.loaded.set(true);
    }
    this.handler = {
      apply: async changes => {
        if (changes.some(change => change.entityType === 'company')) {
          await this.refresh(scope);
          if (!this.lastRefreshSucceeded) throw new Error('settings_refresh_failed');
        }
      },
      reset: async () => {
        await this.refresh(scope);
        return this.lastRefreshSucceeded;
      },
    };
    this.channel = this.journal.subscribe(
      'settings',
      scope,
      companyId,
      this.handler,
      'company-preferences'
    );
    if (!cached && this.connectivity.online()) await this.refresh(scope);
  }

  private currentScope(): string | null {
    const identity = this.supabase.offlineIdentity();
    const locationId = this.locations.activeId();
    return identity && locationId ? offlineScopeKey(identity, locationId) : null;
  }
}
