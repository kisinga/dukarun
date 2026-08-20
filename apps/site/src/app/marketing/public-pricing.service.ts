import {
  Injectable,
  PLATFORM_ID,
  PendingTasks,
  TransferState,
  inject,
  makeStateKey,
} from '@angular/core';
import { isPlatformServer } from '@angular/common';
import type { Database } from '@dukarun/shared-types';
import { environment } from '../../environments/environment';
import { FIXTURE_BILLING_CONFIG, FIXTURE_PLANS } from '../core/public-content.fixture';
import { PublicSupabaseService } from '../core/public-supabase.service';

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
  newCustomerTierCode: string;
  newCustomerTierName: string;
  initialPurchasePrice: number;
  testingAccessMonths: number;
}

const PLANS_KEY = makeStateKey<PublicSubscriptionPlan[]>('site:pricing-plans');
const BILLING_KEY = makeStateKey<PublicBillingConfig | null>('site:billing-config');

@Injectable({ providedIn: 'root' })
export class PublicPricingService {
  private readonly supabase = inject(PublicSupabaseService);
  private readonly pendingTasks = inject(PendingTasks);
  private readonly transferState = inject(TransferState);
  private readonly platformId = inject(PLATFORM_ID);

  transferredPlans(): PublicSubscriptionPlan[] | null {
    return this.transferState.hasKey(PLANS_KEY) ? this.transferState.get(PLANS_KEY, []) : null;
  }

  transferredBillingConfig(): PublicBillingConfig | null | undefined {
    return this.transferState.hasKey(BILLING_KEY)
      ? this.transferState.get(BILLING_KEY, null)
      : undefined;
  }

  async activePlans(force = false): Promise<PublicSubscriptionPlan[]> {
    if (!force && this.transferState.hasKey(PLANS_KEY))
      return this.transferState.get(PLANS_KEY, []);
    const plans =
      environment.publicDataMode === 'fixture'
        ? FIXTURE_PLANS
        : await this.track(async () => {
            const { data, error } = await this.supabase.client
              .from('subscription_tiers')
              .select(
                'id, code, name, price_monthly, price_yearly, max_team_members, max_products, max_stock_locations, max_orders_per_month, sms_per_period, whatsapp_per_period, storefront_available, payment_reminders_available, multiple_locations_enabled, staff_performance_enabled, commissions_available'
              )
              .eq('is_active', true)
              .order('price_monthly');
            if (error) throw error;
            return data ?? [];
          });
    if (isPlatformServer(this.platformId)) this.transferState.set(PLANS_KEY, plans);
    return plans;
  }

  async billingConfig(force = false): Promise<PublicBillingConfig | null> {
    if (!force && this.transferState.hasKey(BILLING_KEY))
      return this.transferState.get(BILLING_KEY, null);
    const config =
      environment.publicDataMode === 'fixture'
        ? FIXTURE_BILLING_CONFIG
        : await this.track(async () => {
            const { data, error } = await this.supabase.client.rpc('public_billing_config');
            if (error) throw error;
            return data as unknown as PublicBillingConfig | null;
          });
    if (isPlatformServer(this.platformId)) this.transferState.set(BILLING_KEY, config);
    return config;
  }

  private track<T>(task: () => Promise<T>): Promise<T> {
    const done = this.pendingTasks.add();
    return task().finally(done);
  }
}
