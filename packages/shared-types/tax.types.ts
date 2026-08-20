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
    | 'purchase'
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

export interface PurchaseTaxEstimateLine extends TaxBreakdown {
  line_index?: number;
  expense_index?: number;
  tax_profile_id: string | null;
}

export interface PurchaseTaxEstimate {
  status: 'estimate';
  tax_configured: boolean;
  vat_registered: boolean;
  tax_profile_id: string | null;
  tax_point_at: string;
  gross_total: number;
  net_total: number;
  tax_total: number;
  goods_gross_total: number;
  goods_net_total: number;
  goods_tax_total: number;
  expense_gross_total: number;
  expense_net_total: number;
  expense_tax_total: number;
  separate_expense_total: number;
  lines: PurchaseTaxEstimateLine[];
  expenses: PurchaseTaxEstimateLine[];
}

export type PurchasePriceBasis = 'inclusive' | 'exclusive';

export interface PurchaseTaxContextLine {
  variant_id: string;
  tax_profile_id: string | null;
  tax_category_id: string | null;
  tax_rate_version_id: string | null;
  tax_category_code: string;
  tax_classification: TaxClassification;
  tax_rate_bps: number;
}

export interface PurchaseTaxContext {
  status: 'context';
  tax_configured: boolean;
  vat_registered: boolean;
  tax_profile_id: string | null;
  tax_point_at: string;
  lines: PurchaseTaxContextLine[];
  supplier_expense: Omit<PurchaseTaxContextLine, 'variant_id'>;
}

export interface PurchaseTaxEvidence {
  claim_input_vat: boolean;
  supplier_tax_pin: string | null;
  tax_invoice_number: string | null;
  tax_invoice_date: string | null;
  tax_point_at: string | null;
}

export type PurchasePostingVersion =
  'gross_reclassification_v1' | 'inline_input_vat_v1' | 'ap_invoice_v2';

export type TaxDocumentSubmissionStatus =
  'queued' | 'processing' | 'retryable' | 'accepted' | 'rejected' | 'cancelled';

export interface TaxIntegrationLine extends TaxBreakdown {
  sequence: number;
  description: string;
  quantity: number;
  unit_price: number | null;
  barcode: string | null;
  external_tax_code: string | null;
  external_item_code: string | null;
  item_classification_code: string | null;
  item_type_code: string | null;
  origin_country_code: string | null;
  packaging_unit_code: string | null;
  quantity_unit_code: string | null;
}

/** A provider-specific preview built from immutable fiscal facts and current mappings. */
export interface TaxIntegrationEnvelope {
  schema_version: number;
  provider_hint: string | null;
  ready: boolean;
  blockers: string[];
  document: {
    id: string;
    number: string;
    kind: 'invoice' | 'credit_note';
    original_document_number: string | null;
    tax_point_at: string;
    source_order_code: string | null;
  };
  issuer: {
    name: string | null;
    tax_registration_number: string | null;
    address: string | null;
  };
  buyer: {
    id: string | null;
    name: string | null;
    tax_registration_number: string | null;
    phone: string | null;
  };
  location: {
    id: string | null;
    code: string | null;
    name: string | null;
    branch_code: string | null;
    mapping_version: number | null;
  };
  payments: Array<{
    internal_method_code: string;
    external_payment_code: string | null;
    amount: number;
  }>;
  currency_code: string | null;
  totals: {
    gross: number;
    net: number;
    tax: number;
  };
  mapping_snapshot: Record<string, unknown>;
  lines: TaxIntegrationLine[];
}

export interface TaxExportArtifact {
  id: string;
  tax_document_id: string;
  provider_code: string;
  artifact_version: number;
  schema_version: number;
  mapping_snapshot: Record<string, unknown>;
  request_payload: TaxIntegrationEnvelope;
  request_hash: string;
  created_at: string;
}

export interface TaxSubmissionJob {
  id: string;
  artifact_id: string;
  status: TaxDocumentSubmissionStatus;
  next_attempt_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaxSubmissionAttempt {
  id: string;
  job_id: string;
  attempt_number: number;
  outcome: 'retryable' | 'accepted' | 'rejected';
  external_reference: string | null;
  attempted_at: string;
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
  integration_schema_version?: number;
  source_order_code?: string | null;
  issuer_tax_registration_number?: string | null;
  buyer_tax_registration_number?: string | null;
  payment_method_codes?: string[];
  payment_breakdown?: Array<{ method_code: string; amount: number }>;
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
