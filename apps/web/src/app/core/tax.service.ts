import { Injectable, inject } from '@angular/core';
import type { Json } from '@dukarun/shared-types';
import type {
  CompanyTaxProfile,
  CompanyTaxActivation,
  DailyCloseStatus,
  PeriodClosingPack,
  TaxCategory,
} from '@dukarun/tax-types';
import { SupabaseService } from './supabase.service';
import { rpcError } from '../pos/pos.service';

export interface TaxJurisdiction {
  id: string;
  country_code: string;
  name: string;
  currency_code: string;
  default_timezone: string;
  status: 'published';
}

export interface CompanyTaxSettings {
  show_vat_breakdown_on_prints: boolean;
  business_timezone: string;
  active_profile: CompanyTaxProfile | null;
  scheduled_profiles: CompanyTaxProfile[];
  categories: TaxCategory[];
  jurisdictions: TaxJurisdiction[];
  activation: CompanyTaxActivation;
}

export interface TaxIntegrationLocation {
  id: string;
  code: string;
  name: string;
  tax_integration_branch_code: string | null;
}

export interface PeriodReadiness {
  period_id: string;
  start_date: string;
  end_date: string;
  blockers: Record<string, number>;
  warnings: Record<string, number>;
  vat: VatReport;
}

export interface VatReport {
  start_date: string;
  end_date: string;
  sales: { gross: number; net: number; output_vat: number; output_vat_net: number };
  by_category: Array<{
    code: string;
    classification: string;
    rate_bps: number;
    gross: number;
    net: number;
    tax: number;
  }>;
  input_vat: number;
  input_vat_claimed: number;
  input_vat_reversals: number;
  credit_note_vat: number;
  void_vat: number;
  net_vat_payable: number;
  late_transactions: Array<Record<string, unknown>>;
}

export interface LateSaleReview {
  id: string;
  client_ref: string;
  occurred_at: string;
  status: 'pending' | 'approved' | 'rejected';
  payload: Json;
  posted_order_id: string | null;
  created_at: string;
}

export interface PosDeviceStatus {
  id: string;
  device_key: string;
  pending_count: number;
  last_seen_at: string;
  last_synced_at: string | null;
  retired_at: string | null;
  retirement_reason: string | null;
}

@Injectable({ providedIn: 'root' })
export class TaxService {
  private readonly supabase = inject(SupabaseService);

  private get db() {
    return this.supabase.client;
  }

  async settings(): Promise<CompanyTaxSettings> {
    const { data, error } = await this.db.rpc('company_tax_settings');
    if (error) throw rpcError(error);
    return data as unknown as CompanyTaxSettings;
  }

  async categories(jurisdictionId: string): Promise<TaxCategory[]> {
    const { data, error } = await this.db
      .from('tax_categories')
      .select('id,code,name,classification,is_default,active')
      .eq('jurisdiction_id', jurisdictionId)
      .eq('active', true)
      .order('is_default', { ascending: false })
      .order('name');
    if (error) throw error;
    return data.map(category => ({ ...category, rate_bps: null })) as TaxCategory[];
  }

  async scheduleProfile(input: {
    jurisdictionId: string;
    vatRegistered: boolean;
    taxRegistrationNumber: string | null;
    effectiveFrom: string;
    defaultTaxCategoryId: string;
  }): Promise<string> {
    const { data, error } = await this.db.rpc('schedule_company_tax_profile', {
      p_jurisdiction_id: input.jurisdictionId,
      p_vat_registered: input.vatRegistered,
      p_tax_registration_number: input.taxRegistrationNumber ?? '',
      p_effective_from: input.effectiveFrom,
      p_default_tax_category_id: input.defaultTaxCategoryId,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async updatePrintVisibility(show: boolean): Promise<boolean> {
    const { data, error } = await this.db.rpc('update_tax_print_settings', {
      p_show_vat_breakdown: show,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async integrationLocations(): Promise<TaxIntegrationLocation[]> {
    const { data, error } = await this.db.rpc('tax_integration_locations');
    if (error) throw rpcError(error);
    return data as unknown as TaxIntegrationLocation[];
  }

  async updateLocationTaxBranchCode(locationId: string, branchCode: string): Promise<string> {
    const { data, error } = await this.db.rpc('update_location_tax_branch_code', {
      p_location_id: locationId,
      p_branch_code: branchCode,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async cancelScheduledProfile(profileId: string): Promise<string> {
    const { data, error } = await this.db.rpc('cancel_scheduled_company_tax_profile', {
      p_profile_id: profileId,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async setProductCategory(productId: string, taxCategoryId: string | null): Promise<string> {
    const { data, error } = await this.db.rpc('set_product_tax_category', {
      p_product_id: productId,
      p_tax_category_id: taxCategoryId ?? undefined,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async vatReport(startDate: string, endDate: string): Promise<VatReport> {
    const { data, error } = await this.db.rpc('vat_report', {
      p_start_date: startDate,
      p_end_date: endDate,
    });
    if (error) throw rpcError(error);
    return data as unknown as VatReport;
  }

  async dailyStatus(date: string): Promise<DailyCloseStatus> {
    const { data, error } = await this.db.rpc('daily_close_status', { p_business_date: date });
    if (error) throw rpcError(error);
    return data as unknown as DailyCloseStatus;
  }

  async signOffDay(date: string): Promise<string> {
    const { data, error } = await this.db.rpc('sign_off_business_day', {
      p_business_date: date,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async periodReadiness(endDate?: string): Promise<PeriodReadiness> {
    const { data, error } = await this.db.rpc('period_close_readiness', {
      ...(endDate ? { p_end_date: endDate } : {}),
    });
    if (error) throw rpcError(error);
    return data as unknown as PeriodReadiness;
  }

  async closedPeriodPack(periodId: string): Promise<PeriodClosingPack | null> {
    const { data, error } = await this.db.rpc('closed_period_pack', {
      p_period_id: periodId,
    });
    if (error) throw rpcError(error);
    return data as unknown as PeriodClosingPack | null;
  }

  async lateSales(): Promise<LateSaleReview[]> {
    const { data, error } = await this.db
      .from('late_sale_reviews')
      .select('id,client_ref,occurred_at,status,payload,posted_order_id,created_at')
      .order('created_at');
    if (error) throw error;
    return data as LateSaleReview[];
  }

  async reviewLateSale(id: string, approve: boolean, reason?: string): Promise<Json> {
    const { data, error } = await this.db.rpc('review_late_sale', {
      p_review_id: id,
      p_approve: approve,
      ...(reason ? { p_reason: reason } : {}),
    });
    if (error) throw rpcError(error);
    return data;
  }

  async posDevices(): Promise<PosDeviceStatus[]> {
    const { data, error } = await this.db
      .from('pos_devices')
      .select(
        'id,device_key,pending_count,last_seen_at,last_synced_at,retired_at,retirement_reason'
      )
      .is('retired_at', null)
      .order('last_seen_at', { ascending: false });
    if (error) throw error;
    return data as PosDeviceStatus[];
  }

  async retirePosDevice(id: string, reason: string): Promise<string> {
    const { data, error } = await this.db.rpc('retire_pos_device', {
      p_device_id: id,
      p_reason: reason,
    });
    if (error) throw rpcError(error);
    return data;
  }
}
