import { Injectable, inject } from '@angular/core';
import type { Database } from '@dukarun/shared-types';
import { SupabaseService } from '../core/supabase.service';

export type DailySummary = Database['public']['Views']['rpt_daily_sales_summary']['Row'];
export type DailyProductSales = Database['public']['Views']['rpt_daily_product_sales']['Row'];
export type DailyCustomerStats = Database['public']['Views']['rpt_daily_customer_stats']['Row'];
export type LowStockVariant = Database['public']['Views']['low_stock_variants']['Row'];
export type ExpiringBatch = Database['public']['Views']['expiring_batches']['Row'];

/**
 * Reports data source. The rpt_* views are materialized and refresh HOURLY —
 * figures can be up to an hour stale (the UI says so under the stats).
 */
@Injectable({ providedIn: 'root' })
export class ReportsService {
  private readonly supabase = inject(SupabaseService);

  private get db() {
    return this.supabase.client;
  }

  /** Daily summary rows from `since` (yyyy-mm-dd, inclusive), ascending. */
  async salesSummary(since: string): Promise<DailySummary[]> {
    const { data, error } = await this.db
      .from('rpt_daily_sales_summary')
      .select('*')
      .gte('day', since)
      .order('day');
    if (error) throw error;
    return data;
  }

  /** Per-variant daily sales from `since` (yyyy-mm-dd, inclusive). */
  async productSales(since: string): Promise<DailyProductSales[]> {
    const { data, error } = await this.db
      .from('rpt_daily_product_sales')
      .select('*')
      .gte('day', since);
    if (error) throw error;
    return data;
  }

  /** Per-customer daily stats from `since` (yyyy-mm-dd, inclusive). */
  async customerStats(since: string): Promise<DailyCustomerStats[]> {
    const { data, error } = await this.db
      .from('rpt_daily_customer_stats')
      .select('*')
      .gte('day', since);
    if (error) throw error;
    return data;
  }

  async lowStock(): Promise<LowStockVariant[]> {
    const { data, error } = await this.db
      .from('low_stock_variants')
      .select('*')
      .order('stock')
      .limit(20);
    if (error) throw error;
    return data;
  }

  async expiringBatches(): Promise<ExpiringBatch[]> {
    const { data, error } = await this.db
      .from('expiring_batches')
      .select('*')
      .order('expiry_date')
      .limit(20);
    if (error) throw error;
    return data;
  }

  /** Customer display names for a set of ids (client-side join). */
  async customerNames(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const { data, error } = await this.db
      .from('customers')
      .select('id, first_name, last_name')
      .in('id', ids);
    if (error) throw error;
    return new Map(
      (data ?? []).map(c => [c.id, [c.first_name, c.last_name].filter(Boolean).join(' ')])
    );
  }
}
