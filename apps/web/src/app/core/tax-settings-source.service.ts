import { Injectable, inject } from '@angular/core';
import type { CompanyTaxSettings } from './tax.service';
import { SupabaseService } from './supabase.service';
import { ServerClockService } from './server-clock.service';

/** Coalesces simultaneous settings reads from designer, VAT UI and printing. */
@Injectable({ providedIn: 'root' })
export class TaxSettingsSourceService {
  private readonly supabase = inject(SupabaseService);
  private readonly clock = inject(ServerClockService);
  private readonly pending = new Map<string, Promise<CompanyTaxSettings>>();

  read(): Promise<CompanyTaxSettings> {
    const identity = this.supabase.offlineIdentity?.();
    const key = `${identity?.companyId ?? ''}:${identity?.userId ?? ''}`;
    const existing = this.pending.get(key);
    if (existing) return existing;
    const request = (async () => {
      const { data, error } = await this.supabase.client.rpc('company_tax_settings');
      if (error) throw error;
      const settings = data as unknown as CompanyTaxSettings;
      this.clock.observe(settings.activation?.server_time);
      return settings;
    })().finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    return request;
  }
}
