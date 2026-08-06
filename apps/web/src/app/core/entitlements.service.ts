import { Injectable, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';

export type FeatureKey = 'multipleLocations' | 'staffPerformance' | 'commissions';
export type LimitKey =
  'maxTeamMembers' | 'maxProducts' | 'maxStockLocations' | 'maxOrdersPerMonth' | 'smsPerPeriod';

export interface EntitlementSnapshot {
  companyId: string;
  status: string | null;
  tierCode: string | null;
  tierName: string | null;
  features: Partial<Record<FeatureKey, boolean>> & Record<string, unknown>;
  settings: {
    commissionsEnabled: boolean;
  };
  limits: Partial<Record<LimitKey, number>> & Record<string, unknown>;
  usage: {
    stockLocations: number;
    products: number;
    ordersThisMonth: number;
    teamMembers: number;
  };
}

/**
 * One read model for plan capabilities. Components use this for explanation and
 * affordances; mutation RPCs remain the authoritative enforcement boundary.
 */
@Injectable({ providedIn: 'root' })
export class EntitlementsService {
  private readonly supabase = inject(SupabaseService);

  readonly snapshot = signal<EntitlementSnapshot | null>(null);
  readonly loading = signal(false);

  constructor() {
    effect(() => {
      if (this.supabase.session()) {
        void this.refresh().catch(() => this.snapshot.set(null));
      } else this.snapshot.set(null);
    });
  }

  enabled(feature: FeatureKey): boolean {
    return this.snapshot()?.features[feature] === true;
  }

  commissionsVisible(): boolean {
    return this.enabled('commissions') && this.snapshot()?.settings.commissionsEnabled === true;
  }

  limit(key: LimitKey): number | null {
    const value = this.snapshot()?.limits[key];
    return typeof value === 'number' ? value : null;
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.client.rpc('current_entitlements');
      if (error) throw error;
      this.snapshot.set(data as unknown as EntitlementSnapshot);
    } finally {
      this.loading.set(false);
    }
  }
}
