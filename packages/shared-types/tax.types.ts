export type TaxClassification =
  'standard' | 'special' | 'zero_rated' | 'exempt' | 'not_registered' | 'not_claimed';

export type TaxPackageStatus = 'draft' | 'published' | 'retired';

export interface TaxPackageReadiness {
  ready: boolean;
  blockers: string[];
}

export interface CompanyTaxActivation {
  business_date: string;
  has_financial_activity_today: boolean;
  earliest_effective_from: string;
}

/** Internal server boundary; clients must never be allowed to supply this directly. */
export interface PostingContext {
  company_id: string;
  location_id: string;
  actor_id: string | null;
  cashier_session_id: string | null;
  occurred_at: string;
  posting_date: string;
  source:
    | 'interactive'
    | 'approval'
    | 'offline'
    | 'offline_review'
    | 'mpesa_provider'
    | 'mpesa_reconciliation';
  late_reason: string | null;
}

export interface TaxRateVersion {
  id: string;
  tax_category_id: string;
  rate_bps: number;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
}
export interface TaxCategory {
  id: string;
  code: string;
  name: string;
  classification: TaxClassification;
  is_default: boolean;
  active?: boolean;
  rate_bps: number | null;
  rate_effective_from?: string | null;
  rate_effective_to?: string | null;
  rates?: TaxRateVersion[];
}

export interface TaxBreakdown {
  gross_total: number;
  net_total: number;
  tax_total: number;
  tax_category_code: string;
  tax_classification: TaxClassification;
  tax_rate_bps: number;
  tax_category_id?: string | null;
  tax_rate_version_id?: string | null;
}

export interface CompanyTaxProfile {
  id: string;
  jurisdiction_id: string;
  country_code: string;
  jurisdiction_name: string;
  vat_registered: boolean;
  tax_registration_number: string | null;
  default_tax_category_id: string | null;
  effective_from: string;
  effective_to: string | null;
  business_timezone: string;
}

export interface TaxDocument {
  id: string;
  document_kind: 'invoice' | 'credit_note';
  document_number: string;
  tax_point_at: string;
  gross_total: number;
  net_total: number;
  tax_total: number;
  external_reference: string | null;
  external_status: 'not_submitted' | 'pending' | 'submitted' | 'accepted' | 'rejected';
}

export interface DailyCloseStatus {
  business_date: string;
  sales: { count: number; gross: number; net: number; vat: number };
  payments: Array<{ method: string; amount: number }>;
  open_sessions: number;
  pending_offline: number;
  pending_late_sales: number;
  signoff: { status: 'signed_off' | 'invalidated'; signed_off_at: string } | null;
}

export interface PeriodClosingPack {
  period_id: string;
  start_date: string;
  end_date: string;
  trial_balance: unknown[];
  profit_and_loss: { income: number; expenses: number };
  balance_summary: Record<string, number>;
  receivables: number;
  payables: number;
  inventory: { quantity: number; value: number };
  vat: Record<string, unknown>;
  reconciliations: unknown[];
  daily_closes: unknown[];
}
