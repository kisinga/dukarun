import { Injectable, inject } from '@angular/core';
import type { Database } from '@dukarun/shared-types';
import { AuthService } from '../core/auth.service';

export type Company = Database['public']['Tables']['companies']['Row'];
export type Tier = Database['public']['Tables']['subscription_tiers']['Row'];
export type AuditRow = Database['public']['Tables']['audit_log']['Row'];
export type OutboxRow = Database['public']['Tables']['outbox']['Row'];
export type CampaignRow = Database['public']['Tables']['message_campaigns']['Row'];
export type MessageTemplateRow = Database['public']['Tables']['message_templates']['Row'];
export type FailedOutboxRow = OutboxRow & {
  companies: Pick<Company, 'name' | 'code'> | null;
};

export interface PlatformStats {
  companies_total: number;
  companies_approved: number;
  companies_pending: number;
  subscriptions_active: number;
  subscriptions_trial: number;
  subscriptions_expired: number;
  orders_today: number;
  revenue_today: number;
  mrr_estimate: number;
}
export interface OperationsSnapshot {
  pending_companies: number;
  failed_outbox: number;
  active_memberships: number;
  unbalanced_journals: number;
}
export interface BillingConfig {
  trialDays: number;
  defaultTrialTierCode: string;
}
export interface PlatformCampaignPreview {
  total: number;
  eligible: number;
  skipped: number;
}

function rpcError(error: { message: string; code?: string }): Error {
  return new Error(error.message);
}

/** Platform operations data (all RPCs raise platform_admin_required otherwise). */
@Injectable({ providedIn: 'root' })
export class PlatformService {
  private readonly auth = inject(AuthService);

  private get db() {
    return this.auth.client;
  }

  async stats(): Promise<PlatformStats> {
    const { data, error } = await this.db.rpc('platform_stats');
    if (error) throw rpcError(error);
    return data as unknown as PlatformStats;
  }

  async operationsSnapshot(): Promise<OperationsSnapshot> {
    const { data, error } = await this.db.rpc('platform_operations_snapshot');
    if (error) throw rpcError(error);
    return data as unknown as OperationsSnapshot;
  }

  async failedOutbox(): Promise<FailedOutboxRow[]> {
    const { data, error } = await this.db
      .from('outbox')
      .select('*, companies(name, code)')
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return data;
  }

  async platformCampaigns(): Promise<CampaignRow[]> {
    const { data, error } = await this.db
      .from('message_campaigns')
      .select('*')
      .eq('scope', 'platform')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return data;
  }

  async platformTemplates(): Promise<MessageTemplateRow[]> {
    const { data, error } = await this.db
      .from('message_templates')
      .select('*')
      .eq('context', 'platform')
      .is('company_id', null)
      .order('name');
    if (error) throw error;
    return data;
  }

  async savePlatformTemplate(input: {
    id: string;
    name: string;
    smsBody: string;
    whatsappBody: string;
    inAppTitle: string;
    inAppBody: string;
  }): Promise<void> {
    const { error } = await this.db.rpc('platform_upsert_message_template', {
      p_template_id: input.id,
      p_name: input.name,
      p_sms_body: input.smsBody,
      p_whatsapp_body: input.whatsappBody,
      p_in_app_title: input.inAppTitle,
      p_in_app_body: input.inAppBody,
    });
    if (error) throw rpcError(error);
  }

  async pendingCompanies(): Promise<Company[]> {
    const { data, error } = await this.db
      .from('companies')
      .select('*')
      .eq('status', 'unapproved')
      .order('created_at');
    if (error) throw error;
    return data;
  }

  async broadcast(title: string, body: string, link?: string): Promise<number> {
    const { data, error } = await this.db.rpc('platform_broadcast', {
      p_title: title,
      p_body: body,
      ...(link ? { p_link: link } : {}),
    });
    if (error) throw rpcError(error);
    return data;
  }

  async companies(query = ''): Promise<Company[]> {
    let q = this.db
      .from('companies')
      .select('*, subscription_tiers(name, code)')
      .order('created_at', { ascending: false })
      .limit(100);
    const trimmed = query.trim();
    if (trimmed) {
      const pattern = `%${trimmed.replace(/[%_,()]/g, ' ')}%`;
      q = q.or(`name.ilike.${pattern},code.ilike.${pattern}`);
    }
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }

  async companyCounts(companyId: string): Promise<{ members: number; orders: number }> {
    const [members, orders] = await Promise.all([
      this.db
        .from('company_memberships')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId),
      this.db
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId),
    ]);
    if (members.error) throw members.error;
    if (orders.error) throw orders.error;
    return { members: members.count ?? 0, orders: orders.count ?? 0 };
  }

  async setCompanyStatus(companyId: string, status: string): Promise<void> {
    const { error } = await this.db.rpc('platform_set_company_status', {
      p_company_id: companyId,
      p_status: status,
    });
    if (error) throw rpcError(error);
  }

  async updateSubscription(
    companyId: string,
    changes: {
      tier_id?: string;
      subscription_status?: string;
      exempt_until?: string;
      exempt_reason?: string;
      expires_at?: string;
    }
  ): Promise<void> {
    const { error } = await this.db.rpc('platform_update_subscription', {
      p_company_id: companyId,
      ...(changes.tier_id ? { p_tier_id: changes.tier_id } : {}),
      ...(changes.subscription_status
        ? { p_subscription_status: changes.subscription_status }
        : {}),
      ...(changes.exempt_until ? { p_exempt_until: changes.exempt_until } : {}),
      ...(changes.exempt_reason ? { p_exempt_reason: changes.exempt_reason } : {}),
      ...(changes.expires_at ? { p_expires_at: changes.expires_at } : {}),
    });
    if (error) throw rpcError(error);
  }

  async tiers(): Promise<Tier[]> {
    const { data, error } = await this.db
      .from('subscription_tiers')
      .select('*')
      .order('price_monthly');
    if (error) throw error;
    return data;
  }

  async billingConfig(): Promise<BillingConfig | null> {
    const { data, error } = await this.db.rpc('public_billing_config');
    if (error) throw rpcError(error);
    return data as unknown as BillingConfig | null;
  }

  async updateBillingConfig(trialDays: number, defaultTrialTierId: string): Promise<void> {
    const { error } = await this.db.rpc('platform_update_billing_config', {
      p_trial_duration_days: trialDays,
      p_default_trial_tier_id: defaultTrialTierId,
    });
    if (error) throw rpcError(error);
  }

  async upsertTier(input: {
    code: string;
    name: string;
    price_monthly: number;
    price_yearly: number;
    multiple_locations_enabled: boolean;
    staff_performance_enabled: boolean;
    commissions_available: boolean;
    max_team_members: number | null;
    max_products: number | null;
    max_stock_locations: number | null;
    max_orders_per_month: number | null;
    sms_per_period: number | null;
    whatsapp_per_period: number | null;
    storefront_available: boolean;
    customer_campaigns_available: boolean;
    payment_reminders_available: boolean;
    tier_id?: string;
    is_active?: boolean;
  }): Promise<string> {
    if ((input.max_products ?? 10_000) > 10_000) {
      throw new Error('Product limits above 10,000 require Enterprise');
    }
    const { data, error } = await this.db.rpc('platform_save_tier', {
      p_code: input.code,
      p_name: input.name,
      p_price_monthly: input.price_monthly,
      p_price_yearly: input.price_yearly,
      p_multiple_locations_enabled: input.multiple_locations_enabled,
      p_staff_performance_enabled: input.staff_performance_enabled,
      p_commissions_available: input.commissions_available,
      p_storefront_available: input.storefront_available,
      p_customer_campaigns_available: input.customer_campaigns_available,
      p_payment_reminders_available: input.payment_reminders_available,
      p_max_team_members: input.max_team_members ?? undefined,
      p_max_products: input.max_products ?? 10_000,
      p_max_stock_locations: input.max_stock_locations ?? undefined,
      p_max_orders_per_month: input.max_orders_per_month ?? undefined,
      p_sms_per_period: input.sms_per_period ?? undefined,
      p_whatsapp_per_period: input.whatsapp_per_period ?? undefined,
      ...(input.tier_id ? { p_tier_id: input.tier_id } : {}),
      ...(input.is_active !== undefined ? { p_is_active: input.is_active } : {}),
    });
    if (error) throw rpcError(error);
    return data;
  }

  async previewCampaign(input: {
    channel: 'in_app' | 'sms' | 'whatsapp';
    audience: 'all' | 'tier' | 'subscription_status' | 'selected';
    tierId?: string;
    subscriptionStatus?: string;
    companyIds?: string[];
  }): Promise<PlatformCampaignPreview> {
    const { data, error } = await this.db.rpc('platform_campaign_preview', {
      p_channel: input.channel,
      p_audience: input.audience,
      ...(input.tierId ? { p_tier_id: input.tierId } : {}),
      ...(input.subscriptionStatus ? { p_subscription_status: input.subscriptionStatus } : {}),
      ...(input.companyIds?.length ? { p_company_ids: input.companyIds } : {}),
    });
    if (error) throw rpcError(error);
    return data as unknown as PlatformCampaignPreview;
  }

  async sendCampaign(input: {
    name: string;
    title: string;
    body: string;
    channel: 'in_app' | 'sms' | 'whatsapp';
    audience: 'all' | 'tier' | 'subscription_status' | 'selected';
    tierId?: string;
    subscriptionStatus?: string;
    companyIds?: string[];
  }): Promise<{ queued: number; skipped: number }> {
    const { data, error } = await this.db.rpc('platform_send_campaign', {
      p_name: input.name,
      p_title: input.title,
      p_body: input.body,
      p_channel: input.channel,
      p_audience: input.audience,
      ...(input.tierId ? { p_tier_id: input.tierId } : {}),
      ...(input.subscriptionStatus ? { p_subscription_status: input.subscriptionStatus } : {}),
      ...(input.companyIds?.length ? { p_company_ids: input.companyIds } : {}),
    });
    if (error) throw rpcError(error);
    return data as unknown as { queued: number; skipped: number };
  }

  async auditLog(filters: {
    table?: string;
    operation?: string;
    companyId?: string;
    since?: string;
  }): Promise<AuditRow[]> {
    let q = this.db
      .from('audit_log')
      .select('*')
      .order('changed_at', { ascending: false })
      .limit(100);
    if (filters.table) q = q.eq('table_name', filters.table);
    if (filters.operation) q = q.eq('operation', filters.operation);
    if (filters.companyId) q = q.eq('company_id', filters.companyId);
    if (filters.since) q = q.gte('changed_at', filters.since);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }
}
