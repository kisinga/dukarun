import { Injectable, inject } from '@angular/core';
import type { Database } from '@dukarun/shared-types';
import { SupabaseService } from '../core/supabase.service';
import { rpcError } from '../pos/pos.service';

export type PaymentMethodRow = Database['public']['Tables']['payment_methods']['Row'];
export type StockLocationRow = Database['public']['Tables']['stock_locations']['Row'];
export type LocationPaymentMethodRow =
  Database['public']['Tables']['location_payment_methods']['Row'];
export type ReminderRule = Database['public']['Tables']['payment_reminder_rules']['Row'];

/**
 * Company settings. The companies table has a COLUMN-LIMITED update grant:
 * only the columns in UPDATABLE_COLUMNS may be patched — anything else
 * fails the grant by design (the UI must never try).
 */
export interface CompanySettings {
  id: string;
  name: string;
  address: string | null;
  email: string | null;
  logo_path: string | null;
  public_storefront_enabled: boolean;
  public_slug: string | null;
  public_whatsapp_number: string | null;
  notification_category_preferences: Record<string, boolean> | null;
  enable_printer: boolean;
  proforma_validity_days: number;
  low_stock_threshold: number;
  cashier_flow_enabled: boolean;
  batch_expiry_enabled: boolean;
  cash_control_enabled: boolean;
  require_opening_count: boolean;
  variance_notification_threshold: number;
  commissions_enabled: boolean;
  payment_reminders_enabled: boolean;
  payment_reminder_channel: 'sms' | 'whatsapp';
  payment_reminder_sms_fallback: boolean;
  automated_customer_notifications_enabled: boolean;
  automated_customer_notifications_override: boolean | null;
}

const SELECT_COLUMNS = [
  'id',
  'name',
  'address',
  'email',
  'logo_path',
  'public_storefront_enabled',
  'public_slug',
  'public_whatsapp_number',
  'notification_category_preferences',
  'enable_printer',
  'proforma_validity_days',
  'low_stock_threshold',
  'cashier_flow_enabled',
  'batch_expiry_enabled',
  'cash_control_enabled',
  'require_opening_count',
  'variance_notification_threshold',
  'commissions_enabled',
  'payment_reminders_enabled',
  'payment_reminder_channel',
  'payment_reminder_sms_fallback',
  'automated_customer_notifications_enabled',
  'automated_customer_notifications_override',
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

  /**
   * Upload the company logo to a fixed path (overwrites any previous one),
   * then point logo_path at it. Returns the storage path.
   */
  async uploadLogo(companyId: string, file: Blob, ext: string): Promise<string> {
    const path = `${companyId}/logo.${ext}`;
    const { error } = await this.db.storage
      .from('company-logos')
      .upload(path, file, { upsert: true });
    if (error) throw new Error(error.message);
    await this.updateSettings(companyId, { logo_path: path });
    return path;
  }

  /** Remove all objects under the company logo prefix and clear logo_path. */
  async removeLogo(companyId: string): Promise<void> {
    const bucket = this.db.storage.from('company-logos');
    const { data: objects, error: listError } = await bucket.list(`${companyId}`);
    if (listError) throw new Error(listError.message);
    const paths = (objects ?? []).map(o => `${companyId}/${o.name}`);
    if (paths.length > 0) {
      const { error: removeError } = await bucket.remove(paths);
      if (removeError) throw new Error(removeError.message);
    }
    await this.updateSettings(companyId, { logo_path: null });
  }

  /** Public URL for a stored logo path (bucket is public). */
  logoPublicUrl(logoPath: string): string {
    return this.db.storage.from('company-logos').getPublicUrl(logoPath).data.publicUrl;
  }

  async paymentMethods(): Promise<PaymentMethodRow[]> {
    const { data, error } = await this.db
      .from('payment_methods')
      .select(
        'id, code, name, enabled, requires_reconciliation, is_cashier_controlled, availability_scope'
      )
      .order('code');
    if (error) throw error;
    return data as PaymentMethodRow[];
  }

  async paymentMethodLocations(): Promise<LocationPaymentMethodRow[]> {
    const { data, error } = await this.db
      .from('location_payment_methods')
      .select('*')
      .eq('enabled', true);
    if (error) throw error;
    return data;
  }

  async setPaymentMethodLocations(
    code: string,
    locationIds: string[],
    allLocations: boolean
  ): Promise<void> {
    const { error } = await this.db.rpc('set_payment_method_locations', {
      p_code: code,
      p_location_ids: locationIds,
      p_all_locations: allLocations,
    });
    if (error) throw rpcError(error);
  }

  async updatePaymentMethod(
    code: string,
    changes: {
      enabled?: boolean;
      requires_reconciliation?: boolean;
      is_cashier_controlled?: boolean;
    }
  ): Promise<void> {
    const { error } = await this.db.rpc('update_payment_method', {
      p_code: code,
      ...(changes.enabled !== undefined ? { p_enabled: changes.enabled } : {}),
      ...(changes.requires_reconciliation !== undefined
        ? { p_requires_reconciliation: changes.requires_reconciliation }
        : {}),
      ...(changes.is_cashier_controlled !== undefined
        ? { p_is_cashier_controlled: changes.is_cashier_controlled }
        : {}),
    });
    if (error) throw rpcError(error);
  }

  async setCommissionsEnabled(enabled: boolean): Promise<boolean> {
    const { data, error } = await this.db.rpc('set_commissions_enabled', { p_enabled: enabled });
    if (error) throw rpcError(error);
    return data;
  }

  async updateCommunicationSettings(input: {
    enabled: boolean;
    channel: 'sms' | 'whatsapp';
    smsFallback: boolean;
    rules: Array<{ stage_days: number; enabled: boolean; template_key: string }>;
  }): Promise<void> {
    const { error } = await this.db.rpc('update_communication_settings', {
      p_reminders_enabled: input.enabled,
      p_channel: input.channel,
      p_sms_fallback: input.smsFallback,
      p_payment_instructions: '',
      p_rules: input.rules,
    });
    if (error) throw rpcError(error);
  }

  async setAutomatedCustomerNotifications(enabled: boolean): Promise<number> {
    const { data, error } = await this.db.rpc('set_automated_customer_notifications', {
      p_enabled: enabled,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async reminderConfiguration(): Promise<ReminderRule[]> {
    const { data, error } = await this.db
      .from('payment_reminder_rules')
      .select('*')
      .order('stage_days');
    if (error) throw error;
    return data;
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
