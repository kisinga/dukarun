import type { ServerClockSnapshot } from '../../core/server-clock';
import type { Database } from '@dukarun/shared-types';
import type { PaymentInput, SaleLineInput } from '../pos.service';
import type {
  CheckoutCustomerInput,
  FulfillmentCheckoutInput,
} from '../../fulfillment/fulfillment.service';

export type OfflineSession = Database['public']['Tables']['cashier_sessions']['Row'];
export interface OfflineContext {
  id: string;
  company_id: string;
  user_id: string;
  location_id: string;
  session_id: string;
  device_key: string;
  issued_at: string;
  expires_at: string;
}
export interface OfflineConfirmation {
  context: OfflineContext;
  clock: ServerClockSnapshot;
}
export interface OfflineCapture {
  offline_context_id: string;
  originating_session_id: string;
  occurred_at: string;
  device_key: string;
  location_id: string;
}
export interface ItemEvidence {
  product_id: string | null;
  variant_id: string;
  pack_id: string | null;
  product_name: string | null;
  variant_name: string | null;
  unit_name: string;
  stock_unit: string;
  units_per_unit: number;
  kind: string | null;
  allow_fractional: boolean | null;
  track_inventory: boolean | null;
  expected_unit_price: number;
  price_floor: number | null;
  catalogue_version: { product: string; variant: string; pack: string | null } | null;
  available?: boolean;
  tax_treatment?: { net_total: number; tax_total: number; tax_rate_bps: number };
}
export interface OfflineRequest extends OfflineCapture {
  protocol_version: 2;
  client_ref: string;
  customer_id: string | null;
  lines: SaleLineInput[];
  payments: PaymentInput[];
  draft_id?: string | null;
  checkout_customer?: CheckoutCustomerInput;
  fulfillment?: FulfillmentCheckoutInput;
}
export interface OfflineBlocker {
  code: string;
  message?: string;
  line?: number;
  reasons?: string[];
}
export type OfflineStatus =
  'completed' | 'waiting' | 'review' | 'approval' | 'failed' | 'cancelled';
export interface OfflineResult {
  status: OfflineStatus;
  review_id: string;
  durable_custody: true;
  order_id: string | null;
  blockers: OfflineBlocker[];
}
export interface OfflineReviewSummary {
  id: string;
  client_ref: string;
  location_id: string;
  device_key: string;
  originating_session_id: string | null;
  captured_at: string;
  received_at: string;
  status: OfflineStatus;
  payments: PaymentInput[];
  blockers: OfflineBlocker[];
}
export interface OfflineReviewLine {
  index: number;
  captured: SaleLineInput;
  current: ItemEvidence;
  proposed: SaleLineInput;
  captured_base_quantity: number;
  proposed_base_quantity: number;
  available_stock: number | null;
  reasons: string[];
}
export interface OfflineReview {
  request_id: string;
  status: OfflineStatus;
  original_request: OfflineRequest;
  proposed_request: OfflineRequest;
  original_session: OfflineSession | null;
  destination_session: OfflineSession | null;
  original_closing_count: { id: string; declared_cash: number } | null;
  open_sessions: OfflineSession[];
  captured_at: string;
  server_time: string;
  lines: OfflineReviewLine[];
  total: number;
  paid: number;
  payments: PaymentInput[];
  blockers: OfflineBlocker[];
  review_fingerprint: string;
  vat: { active_profile?: { vat_registered?: boolean } | null };
}

/** Unknown or incomplete outcomes never authorize deleting a queued request. */
export function parseOfflineResult(value: unknown): OfflineResult {
  const result = value as Partial<OfflineResult> | null;
  if (
    !result ||
    !['completed', 'waiting', 'review', 'approval', 'failed', 'cancelled'].includes(
      result.status ?? ''
    ) ||
    result.durable_custody !== true ||
    typeof result.review_id !== 'string' ||
    !result.review_id ||
    !Array.isArray(result.blockers) ||
    (result.status === 'completed' && !result.order_id)
  ) {
    throw new Error('The server has not confirmed this sale. Its queued request has been kept.');
  }
  return result as OfflineResult;
}

export function confirmedOfflineTime(
  confirmation: OfflineConfirmation | null,
  now: number | null
): number | null {
  if (!confirmation || now === null) return null;
  const issued = Date.parse(confirmation.context.issued_at);
  const expires = Date.parse(confirmation.context.expires_at);
  return Number.isFinite(issued) && Number.isFinite(expires) && now >= issued && now < expires
    ? now
    : null;
}

let installationKey: string | undefined;
export function offlineDeviceKey(): string {
  if (installationKey) return installationKey;
  const storageKey = 'dukarun-pos-device-key';
  try {
    installationKey = localStorage.getItem(storageKey) || crypto.randomUUID();
    localStorage.setItem(storageKey, installationKey);
  } catch {
    installationKey = crypto.randomUUID();
  }
  return installationKey;
}

const blockerLabels: Record<string, string> = {
  capture_age_review: 'Captured 24 hours ago or more, or capture time needs checking',
  offline_context_review: 'Offline session confirmation expired or needs checking',
  session_crossover_required: 'Confirm moving this sale into the selected open session',
  open_destination_required: 'Open a cashier session at this location first',
  item_evidence_required: 'Item evidence is incomplete',
  item_structure_changed: 'Item units or inventory rules changed',
  item_price_changed: 'Catalogue price or price floor changed',
  item_unavailable: 'Product or pack is unavailable',
  insufficient_stock: 'Not enough stock to post the whole sale',
  invalid_quantity: 'Quantity does not meet the current item rules',
  payment_mismatch: 'Payments do not match the proposed total',
  credit_approval_required: 'Customer credit approval is required',
  review_changed: 'Details changed since your review. Check them again',
};
export function offlineBlockerLabel(blocker: OfflineBlocker): string {
  if (blocker.reasons?.length)
    return `Item ${(blocker.line ?? 0) + 1}: ${blocker.reasons.map(code => blockerLabels[code] ?? code.replaceAll('_', ' ')).join('; ')}`;
  return blocker.message ?? blockerLabels[blocker.code] ?? blocker.code.replaceAll('_', ' ');
}
