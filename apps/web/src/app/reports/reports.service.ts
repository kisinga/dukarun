import { Injectable, inject } from '@angular/core';
import type { Database } from '@dukarun/shared-types';
import { SupabaseService } from '../core/supabase.service';

export type DailySummary = Database['public']['Views']['rpt_daily_sales_summary']['Row'];
export type DailyProductSales = Database['public']['Views']['rpt_daily_product_sales']['Row'];
export type DailyCustomerStats = Database['public']['Views']['rpt_daily_customer_stats']['Row'];
export type LowStockVariant = Database['public']['Views']['low_stock_variants']['Row'];
export type ExpiringBatch = Database['public']['Views']['expiring_batches']['Row'];

export interface DashboardDailySummary {
  company_id?: string | null;
  day: string;
  orders: number;
  revenue: number;
  cogs: number;
  margin: number;
  quantity: number;
}

export interface DashboardTopVariant {
  variant_id: string;
  quantity: number;
  revenue: number;
  cogs: number;
  margin: number;
}

export interface DashboardSalesSnapshot {
  summary: DashboardDailySummary[];
  topVariants: DashboardTopVariant[];
  locations: DashboardLocationSummary[];
  comparison: DashboardPeriodComparison;
  refreshAfter?: string;
}

export interface DashboardLocationSummary {
  location_id: string;
  location_name: string;
  orders: number;
  revenue: number;
  quantity: number;
  cogs: number;
  margin: number;
}

export interface DashboardPeriodComparison {
  current_revenue: number;
  current_quantity: number;
  current_orders: number;
  previous_revenue: number;
  previous_quantity: number;
  previous_orders: number;
}

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

  /**
   * Live operational snapshot for the dashboard. Unlike rpt_* materialized
   * views, this reads the source tables and is current as soon as a sale posts.
   */
  async dashboardSales(since: string, locationId: string | null): Promise<DashboardSalesSnapshot> {
    const { data, error } = await this.db.rpc('dashboard_location_snapshot', {
      p_since: since,
      ...(locationId ? { p_location_id: locationId } : {}),
    });
    if (error) throw error;
    const snapshot = data as unknown as Partial<DashboardSalesSnapshot> | null;
    return {
      summary: snapshot?.summary ?? [],
      topVariants: snapshot?.topVariants ?? [],
      locations: snapshot?.locations ?? [],
      comparison: snapshot?.comparison ?? {
        current_revenue: 0,
        current_quantity: 0,
        current_orders: 0,
        previous_revenue: 0,
        previous_quantity: 0,
        previous_orders: 0,
      },
      ...(snapshot?.refreshAfter ? { refreshAfter: snapshot.refreshAfter } : {}),
    };
  }

  /** Daily summary rows in the inclusive yyyy-mm-dd range, ascending. */
  async salesSummary(since: string, until: string): Promise<DailySummary[]> {
    const { data, error } = await this.db
      .from('rpt_daily_sales_summary')
      .select('*')
      .gte('day', since)
      .lte('day', until)
      .order('day');
    if (error) throw error;
    return data;
  }

  /** Per-variant daily sales in the inclusive yyyy-mm-dd range. */
  async productSales(since: string, until: string): Promise<DailyProductSales[]> {
    const { data, error } = await this.db
      .from('rpt_daily_product_sales')
      .select('*')
      .gte('day', since)
      .lte('day', until);
    if (error) throw error;
    return data;
  }

  /** Per-customer daily stats in the inclusive yyyy-mm-dd range. */
  async customerStats(since: string, until: string): Promise<DailyCustomerStats[]> {
    const { data, error } = await this.db
      .from('rpt_daily_customer_stats')
      .select('*')
      .gte('day', since)
      .lte('day', until);
    if (error) throw error;
    return data;
  }

  async lowStock(locationId?: string | null): Promise<{ rows: LowStockVariant[]; total: number }> {
    const request = locationId
      ? this.db
          .from('low_stock_variants_by_location')
          .select('*', { count: 'exact' })
          .eq('location_id', locationId)
          .order('stock')
          .limit(20)
      : this.db.from('low_stock_variants').select('*', { count: 'exact' }).order('stock').limit(20);
    const { data, error, count } = await request;
    if (error) throw error;
    return { rows: data as LowStockVariant[], total: count ?? data.length };
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
      .select('id, first_name, last_name, deleted_at')
      .in('id', ids);
    if (error) throw error;
    return new Map(
      (data ?? []).map(c => [
        c.id,
        `${[c.first_name, c.last_name].filter(Boolean).join(' ')}${c.deleted_at ? ' (Deleted)' : ''}`,
      ])
    );
  }
}
