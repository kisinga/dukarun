import { Injectable, inject } from '@angular/core';
import type { Database } from '@dukarun/shared-types';
import { SupabaseService } from '../core/supabase.service';

export type PublicSubscriptionPlan = Pick<
  Database['public']['Tables']['subscription_tiers']['Row'],
  | 'id'
  | 'code'
  | 'name'
  | 'price_monthly'
  | 'price_yearly'
  | 'max_team_members'
  | 'max_products'
  | 'max_stock_locations'
  | 'max_orders_per_month'
  | 'sms_per_period'
  | 'whatsapp_per_period'
  | 'storefront_available'
  | 'payment_reminders_available'
  | 'multiple_locations_enabled'
  | 'staff_performance_enabled'
  | 'commissions_available'
>;

export interface PublicBillingConfig {
  trialDays: number;
  defaultTrialTierCode: string;
}

@Injectable({ providedIn: 'root' })
export class PublicPricingService {
  private readonly supabase = inject(SupabaseService);

  async activePlans(): Promise<PublicSubscriptionPlan[]> {
    const { data, error } = await this.supabase.client
      .from('subscription_tiers')
      .select(
        'id, code, name, price_monthly, price_yearly, max_team_members, max_products, max_stock_locations, max_orders_per_month, sms_per_period, whatsapp_per_period, storefront_available, payment_reminders_available, multiple_locations_enabled, staff_performance_enabled, commissions_available'
      )
      .eq('is_active', true)
      .order('price_monthly');

    if (error) throw error;
    return data ?? [];
  }

  async billingConfig(): Promise<PublicBillingConfig | null> {
    const { data, error } = await this.supabase.client.rpc('public_billing_config');
    if (error) throw error;
    return data as unknown as PublicBillingConfig | null;
  }
}
