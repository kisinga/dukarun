import { Injectable, inject } from '@angular/core';
import type { Database } from '@dukarun/shared-types';
import { environment } from '../../environments/environment';
import { SupabaseService } from '../core/supabase.service';

export type Tier = Database['public']['Tables']['subscription_tiers']['Row'];
export type BillingCycle = 'monthly' | 'yearly';

export interface TierLimits {
  maxAdmins?: number;
  maxProducts?: number;
  maxStockLocations?: number;
  maxOrdersPerMonth?: number;
  smsPerPeriod?: number;
}

/** Company billing row (companies read surface). */
export interface CompanyBilling {
  id: string;
  subscription_status: string | null;
  trial_ends_at: string | null;
  subscription_expires_at: string | null;
  billing_cycle: string | null;
  last_payment_date: string | null;
  last_payment_amount: number | null;
  subscription_grace_period_end: string | null;
  subscription_exempt_until: string | null;
  subscription_tier_id: string | null;
  subscription_tiers: Pick<Tier, 'name' | 'code'> | null;
}

export interface ChargeResult {
  status: string;
  reference: string;
  display_text: string;
}

@Injectable({ providedIn: 'root' })
export class BillingService {
  private readonly supabase = inject(SupabaseService);

  private get db() {
    return this.supabase.client;
  }

  async tiers(): Promise<Tier[]> {
    const { data, error } = await this.db
      .from('subscription_tiers')
      .select('*')
      .eq('is_active', true)
      .order('price_monthly');
    if (error) throw error;
    return data;
  }

  async companyBilling(): Promise<CompanyBilling> {
    const { data, error } = await this.db
      .from('companies')
      .select(
        'id, subscription_status, trial_ends_at, subscription_expires_at, billing_cycle, last_payment_date, last_payment_amount, subscription_grace_period_end, subscription_exempt_until, subscription_tier_id, subscription_tiers(name, code)'
      )
      .limit(1)
      .single();
    if (error) throw error;
    return data as unknown as CompanyBilling;
  }

  /**
   * POST the paystack-charge edge function with the user's bearer token.
   * Returns display text for the pending STK push, or throws a readable error.
   */
  async charge(tierId: string, cycle: BillingCycle, phone: string): Promise<ChargeResult> {
    const { data: sessionData } = await this.db.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('Not signed in');

    const res = await fetch(`${environment.supabaseUrl}/functions/v1/paystack-charge`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tier_id: tierId, billing_cycle: cycle, phone }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Edge function errors come back as {error} — surface verbatim.
      const message =
        (body as { error?: string }).error ?? `Payment request failed (HTTP ${res.status})`;
      throw new Error(message);
    }
    return body as ChargeResult;
  }
}
