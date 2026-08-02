import { Injectable, inject } from '@angular/core';
import type { Database } from '@dukarun/shared-types';
import { AuthService } from '../core/auth.service';

export type Company = Database['public']['Tables']['companies']['Row'];
export type Tier = Database['public']['Tables']['subscription_tiers']['Row'];
export type AuditRow = Database['public']['Tables']['audit_log']['Row'];

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

  async upsertTier(input: {
    code: string;
    name: string;
    price_monthly: number;
    price_yearly: number;
    limits?: Record<string, number>;
    tier_id?: string;
    is_active?: boolean;
  }): Promise<void> {
    const { error } = await this.db.rpc('platform_upsert_tier', {
      p_code: input.code,
      p_name: input.name,
      p_price_monthly: input.price_monthly,
      p_price_yearly: input.price_yearly,
      ...(input.limits ? { p_limits: input.limits as never } : {}),
      ...(input.tier_id ? { p_tier_id: input.tier_id } : {}),
      ...(input.is_active !== undefined ? { p_is_active: input.is_active } : {}),
    });
    if (error) throw rpcError(error);
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
