export type CreditBand = 'unrated' | 'strong' | 'good' | 'watch' | 'restricted' | 'high_risk';
export type CreditConfidence = 'unrated' | 'provisional' | 'established';
export type InsightUrgency = 'critical' | 'plan';

export interface InsightSignal {
  urgency: InsightUrgency;
  domain: 'credit' | 'products';
  entity_type: 'customer' | 'supplier' | 'product';
  entity_id: string;
  title: string;
  signal: string;
  reason_code: string;
  consequence_code: string;
  amount: number | null;
  stock: number | null;
  refreshed_at: string;
  href: string;
}

export interface CreditDecisionCard {
  customerId: string;
  score: number | null;
  band: CreditBand;
  confidence: CreditConfidence;
  reasonCodes: string[];
  recommendationCode: string;
  scoreTimestamp: string | null;
  balance?: number;
  creditLimit?: number;
  availableCredit?: number | null;
  overdueAmount?: number;
  oldestOverdueDays?: number;
}

export interface CreditAdvisoryReview {
  requested: CreditDecisionCard | null;
  current: CreditDecisionCard;
}

export interface PartyCreditProfile {
  party_id: string;
  side: 'customer' | 'supplier';
  party_name: string;
  score: number | null;
  band: CreditBand;
  confidence: CreditConfidence;
  balance: number;
  credit_limit: number;
  available_credit: number | null;
  utilization: number | null;
  overdue_amount: number;
  oldest_due_on: string | null;
  oldest_overdue_days: number;
  settled_documents: number;
  history_days: number;
  punctuality: number | null;
  recommendation_code: string;
  reason_codes: string[];
  opportunity_cost: number;
  refreshed_at: string;
  events?: CreditProfileEvent[];
  documents?: CreditDocumentPerformance[];
}

export interface CreditProfileEvent {
  score: number | null;
  band: CreditBand;
  confidence: CreditConfidence;
  reason_codes: string[];
  created_at: string;
}

export interface CreditDocumentPerformance {
  document_id: string;
  document_code: string;
  issued_on: string;
  due_on: string;
  original_amount: number;
  settled_amount: number;
  outstanding_amount: number;
  settled_on: string | null;
  settled_days_late: number | null;
  punctuality_factor: number | null;
  overdue_days: number;
}

export interface DataCoverageBadge {
  quality: 'estimated' | 'exact' | 'reconciled';
  label: string;
}

export type DateRangePreset = 7 | 30 | 180 | 365;

export interface ProductDemandSummary {
  variant_id: string;
  product_id: string;
  product_name: string;
  variant_name: string;
  stock_unit: string;
  manufacturer_id: string | null;
  manufacturer_name: string | null;
  preferred_supplier_id: string | null;
  preferred_supplier_name: string | null;
  current_quantity: number;
  previous_quantity: number;
  gross_revenue: number | null;
  refund_amount: number | null;
  net_revenue: number | null;
  corrected_cogs: number | null;
  margin: number | null;
  signal: string | null;
  current_stock: number;
  current_value: number | null;
  days_of_cover: number | null;
  reorder_quantity: number | null;
  last_sale_date: string | null;
  reason_code: string | null;
  refreshed_at: string | null;
}

export interface ProductIntelligenceSummary {
  trackedVariants: number;
  needsAttention: number;
  stockouts: number;
  unitsSold: number;
  stockOnHand: number;
  stockValue: number | null;
  netRevenue: number | null;
  margin: number | null;
}

export interface ProductProfile {
  variant: {
    id: string;
    productId: string;
    productName: string;
    variantName: string;
    sku: string;
    stockUnit: string;
    manufacturerId: string | null;
    manufacturerName: string | null;
    supplierId: string | null;
    supplierName: string | null;
  };
  attention: Record<string, unknown> | null;
  trend: Array<Record<string, number | string | null>>;
  positions: Array<{
    day: string;
    closing_quantity: number | null;
    closing_value: number | null;
    quality: 'estimated' | 'exact' | 'reconciled';
  }>;
  coverage: { from: string; to: string; days: number; estimatedDays: number };
  summary: {
    averageStock: number | null;
    stockoutDays: number;
    unitsSold: number;
    netRevenue: number | null;
    cogs: number | null;
    margin: number | null;
  };
}

export const CREDIT_BAND_LABELS: Record<CreditBand, string> = {
  unrated: 'Unrated',
  strong: 'Strong',
  good: 'Good',
  watch: 'Watch',
  restricted: 'Restricted',
  high_risk: 'High risk',
};

export const INSIGHT_COPY: Record<string, string> = {
  over_limit: 'The current balance is above the configured credit limit.',
  overdue_60_plus: 'Some credit has been overdue for more than 60 days.',
  overdue_31_60: 'Some credit has been overdue for 31–60 days.',
  overdue_8_30: 'Some credit has been overdue for 8–30 days.',
  overdue_1_7: 'A payment has recently passed its due date.',
  frequently_late: 'Recent settled documents were often paid late.',
  no_current_risk: 'No material current risk was detected.',
  demand_without_stock: 'Recent demand exists, but there is no stock available.',
  below_lead_time_cover: 'Stock may run out before a typical replenishment arrives.',
  below_target_cover: 'Stock is below the lead-time and safety-day target.',
  insufficient_demand_history: 'There is not enough recent demand to estimate cover.',
  review_reorder: 'Review the suggested quantity before starting a purchase.',
  review_demand_history: 'Review sales history before deciding how much to buy.',
  maintain_review_eligible: 'Maintain terms; this account may be eligible for review.',
  maintain: 'Maintain the current credit policy.',
  pause_increases_target_down_10: 'Pause increases and review a 10% lower target.',
  manager_review_target_down_25: 'Manager review is advised; consider a 25% lower target.',
  pause_new_credit: 'Consider pausing new credit until the account recovers.',
  establish_limit: 'Establish a documented credit limit.',
};

export function insightCopy(code: string | null | undefined): string {
  if (!code) return 'No explanation is available yet.';
  return INSIGHT_COPY[code] ?? code.replaceAll('_', ' ');
}
