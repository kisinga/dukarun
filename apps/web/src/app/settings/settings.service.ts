import { Injectable, inject } from '@angular/core';
import type { Database } from '@dukarun/shared-types';
import { SupabaseService } from '../core/supabase.service';
import { rpcError } from '../pos/pos.service';

export type PaymentMethodRow = Database['public']['Tables']['payment_methods']['Row'];
export type StockLocationRow = Database['public']['Tables']['stock_locations']['Row'];

/**
 * Company settings. The companies table has a COLUMN-LIMITED update grant:
 * only the columns in UPDATABLE_COLUMNS may be patched — anything else
 * fails the grant by design (the UI must never try).
 */
export interface CompanySettings {
  id: string;
  name: string;
  logo_path: string | null;
  public_storefront_enabled: boolean;
  public_slug: string | null;
  public_whatsapp_number: string | null;
  notification_category_preferences: Record<string, boolean> | null;
  enable_printer: boolean;
  low_stock_threshold: number;
  cashier_flow_enabled: boolean;
  batch_expiry_enabled: boolean;
  cash_control_enabled: boolean;
  require_opening_count: boolean;
  variance_notification_threshold: number;
}

const SELECT_COLUMNS = [
  'id',
  'name',
  'logo_path',
  'public_storefront_enabled',
  'public_slug',
  'public_whatsapp_number',
  'notification_category_preferences',
  'enable_printer',
  'low_stock_threshold',
  'cashier_flow_enabled',
  'batch_expiry_enabled',
  'cash_control_enabled',
  'require_opening_count',
  'variance_notification_threshold',
].join(', ');

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly supabase = inject(SupabaseService);

  private get db() {
    return this.supabase.client;
  }

  async getSettings(): Promise<CompanySettings> {
    const { data, error } = await this.db
      .from('companies')
      .select(SELECT_COLUMNS)
      .limit(1)
      .single();
    if (error) throw error;
    return data as unknown as CompanySettings;
  }

  /** Patch ONLY the granted columns (see UPDATABLE_COLUMNS contract). */
  async updateSettings(id: string, patch: Partial<Omit<CompanySettings, 'id'>>): Promise<void> {
    const { error } = await this.db.from('companies').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
  }

  async paymentMethods(): Promise<PaymentMethodRow[]> {
    const { data, error } = await this.db
      .from('payment_methods')
      .select('code, name, enabled, requires_reconciliation, is_cashier_controlled')
      .order('code');
    if (error) throw error;
    return data as PaymentMethodRow[];
  }

  async updatePaymentMethod(
    code: string,
    changes: { enabled?: boolean; requires_reconciliation?: boolean }
  ): Promise<void> {
    const { error } = await this.db.rpc('update_payment_method', {
      p_code: code,
      ...(changes.enabled !== undefined ? { p_enabled: changes.enabled } : {}),
      ...(changes.requires_reconciliation !== undefined
        ? { p_requires_reconciliation: changes.requires_reconciliation }
        : {}),
    });
    if (error) throw rpcError(error);
  }

  async stockLocations(): Promise<StockLocationRow[]> {
    const { data, error } = await this.db
      .from('stock_locations')
      .select('*')
      .order('is_default', { ascending: false })
      .order('name');
    if (error) throw error;
    return data;
  }

  async createStockLocation(code: string, name: string, isDefault: boolean): Promise<string> {
    const { data, error } = await this.db.rpc('create_stock_location', {
      p_code: code,
      p_name: name,
      p_is_default: isDefault,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async updateStockLocation(
    id: string,
    code: string,
    name: string,
    isDefault: boolean
  ): Promise<string> {
    const { data, error } = await this.db.rpc('update_stock_location', {
      p_location_id: id,
      p_code: code,
      p_name: name,
      p_is_default: isDefault,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async deleteStockLocation(id: string): Promise<string> {
    const { data, error } = await this.db.rpc('delete_stock_location', {
      p_location_id: id,
    });
    if (error) throw rpcError(error);
    return data;
  }
}
