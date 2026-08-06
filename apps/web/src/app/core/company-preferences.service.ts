import { Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { LocationContextService } from './location-context.service';
import { offlineDb, offlineScopeKey } from '../pos/offline/offline-db';

/** Runtime company switches used outside the Settings screen. */
@Injectable({ providedIn: 'root' })
export class CompanyPreferencesService {
  readonly cashierFlowEnabled = signal(false);
  readonly cashControlEnabled = signal(true);
  readonly requireOpeningCount = signal(true);
  readonly batchExpiryEnabled = signal(false);
  readonly loaded = signal(false);

  private refreshPromise: Promise<void> | null = null;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly locations: LocationContextService
  ) {}

  refresh(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.load().finally(() => (this.refreshPromise = null));
    return this.refreshPromise;
  }

  private async load(): Promise<void> {
    const identity = this.supabase.offlineIdentity();
    const locationId = this.locations.activeId();
    if (!identity || !locationId) return;
    const key = offlineScopeKey(identity, locationId);
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
      this.cashierFlowEnabled.set(data.cashier_flow_enabled);
      this.cashControlEnabled.set(data.cash_control_enabled);
      this.requireOpeningCount.set(data.require_opening_count);
      this.batchExpiryEnabled.set(data.batch_expiry_enabled);
      const existing = await db.get('settings', key);
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
      const cached = await db.get('settings', key);
      this.cashierFlowEnabled.set(cached?.cashier_flow_enabled ?? false);
      this.cashControlEnabled.set(cached?.cash_control_enabled ?? true);
      this.requireOpeningCount.set(cached?.require_opening_count ?? true);
      this.batchExpiryEnabled.set(cached?.batch_expiry_enabled ?? false);
    } finally {
      this.loaded.set(true);
    }
  }
}
