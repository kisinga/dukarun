import { Injectable, inject } from '@angular/core';
import type { Json } from '@dukarun/shared-types';
import { SupabaseService } from '../core/supabase.service';
import type { PaymentInput, PostSaleResult, SaleLineInput } from '../pos/pos.service';
import { rpcError } from '../pos/pos.service';

export type FulfillmentType = 'pickup' | 'delivery';
export type FulfillmentStatus =
  'pending' | 'processing' | 'ready' | 'in_transit' | 'fulfilled' | 'failed' | 'cancelled';
export type FulfillmentCollectionKind = 'none' | 'cod';

export interface FulfillmentItem {
  name: string;
  quantity: number;
}

export interface FulfillmentBoardRow {
  id: string;
  order_id: string;
  order_code: string;
  fulfillment_type: FulfillmentType;
  status: FulfillmentStatus;
  collection_kind: FulfillmentCollectionKind;
  promised_at: string | null;
  updated_at: string;
  state_version: number;
  assigned_membership_id: string | null;
  assigned_name: string | null;
  recipient_name: string | null;
  phone_normalized: string | null;
  address_line: string | null;
  landmark: string | null;
  map_link: string | null;
  preparation_notes: string | null;
  handoff_notes: string | null;
  order_status: string;
  cod_balance: number | null;
  items: FulfillmentItem[];
}

export interface FulfillmentEvent {
  id: string;
  event_kind: string;
  from_status: FulfillmentStatus | null;
  to_status: FulfillmentStatus | null;
  note: string | null;
  source_kind: 'staff' | 'system' | 'provider';
  created_at: string;
}

export interface FulfillmentDetail extends FulfillmentBoardRow {
  events: FulfillmentEvent[];
}

export interface FulfillmentSettings {
  company_id: string;
  location_id: string;
  enabled: boolean;
  pickup_enabled: boolean;
  delivery_enabled: boolean;
  cod_enabled: boolean;
  default_delivery_fee_variant_id: string | null;
  pickup_sla_minutes: number;
  delivery_sla_minutes: number;
  notification_channel: 'sms' | 'whatsapp';
  sms_fallback: boolean;
  notify_initial: boolean;
  notify_ready: boolean;
  notify_in_transit: boolean;
  notify_failed: boolean;
  notify_fulfilled: boolean;
  tracking_token_ttl_days: number;
  feature_available: boolean;
  delivery_fee_variant?: {
    id: string;
    name: string;
    price: number;
    active: boolean;
  } | null;
}

export interface CheckoutCustomerInput {
  customer_id?: string | null;
  name: string;
  phone?: string | null;
  save_as_customer: boolean;
}

export interface FulfillmentCheckoutInput {
  type: FulfillmentType;
  collection_kind: FulfillmentCollectionKind;
  recipient_name: string;
  phone?: string | null;
  address?: string | null;
  landmark?: string | null;
  map_link?: string | null;
  preparation_notes?: string | null;
  handoff_notes?: string | null;
  promised_at?: string | null;
  transactional_message_consent: boolean;
}

export interface FulfillmentCheckoutResult {
  order_id: string;
  fulfillment_id: string | null;
  customer_id: string | null;
  status: string;
  state_version: number | null;
  tracking_token: string | null;
  pin: string | null;
}

export interface CashHolding {
  payment_id: string;
  fulfillment_id: string;
  order_code: string;
  amount: number;
  collected_at: string;
  custodian_membership_id: string;
  custodian_name: string;
}

export interface CashRemittance {
  id: string;
  status: 'submitted' | 'accepted' | 'rejected' | 'shortage_resolved';
  expected_amount: number;
  received_amount: number | null;
  submitted_at: string;
  accepted_at: string | null;
  custodian_membership_id: string;
  custodian_name: string;
  payment_count: number;
  variance_reason: string | null;
}

export interface PendingCodSplit {
  intent_id: string;
  mpesa_amount: number;
  cash_amount: number;
  provider_receipt: string | null;
}

export interface FulfillmentAssignee {
  membership_id: string;
  display_name: string;
}

export interface OrderFulfillmentSummary {
  order_id: string;
  fulfillment_id: string;
  fulfillment_type: FulfillmentType;
  fulfillment_status: FulfillmentStatus;
  collection_kind: FulfillmentCollectionKind;
  cod_balance: number | null;
}

type RpcResult<T> = Promise<{ data: T | null; error: { message: string; code?: string } | null }>;
type RpcClient = { rpc: (name: string, args?: Record<string, unknown>) => RpcResult<unknown> };

@Injectable({ providedIn: 'root' })
export class FulfillmentService {
  private readonly supabase = inject(SupabaseService);

  private async rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const client = this.supabase.client as unknown as RpcClient;
    const { data, error } = await client.rpc(name, args);
    if (error) throw rpcError(error);
    return data as T;
  }

  settings(locationId: string): Promise<FulfillmentSettings> {
    return this.rpc('fulfillment_settings_at_location', { p_location_id: locationId });
  }

  updateSettings(
    locationId: string,
    settings: Partial<FulfillmentSettings>
  ): Promise<FulfillmentSettings> {
    return this.rpc('update_fulfillment_settings', {
      p_location_id: locationId,
      p_settings: settings as unknown as Json,
    });
  }

  board(
    locationId: string,
    options: {
      statuses?: FulfillmentStatus[];
      mine?: boolean;
      cursor?: string;
      limit?: number;
    } = {}
  ): Promise<FulfillmentBoardRow[]> {
    return this.rpc('fulfillment_board', {
      p_location_id: locationId,
      p_statuses: options.statuses ?? null,
      p_mine: options.mine ?? false,
      p_cursor: options.cursor ?? null,
      p_limit: options.limit ?? 100,
    });
  }

  detail(id: string): Promise<FulfillmentDetail> {
    return this.rpc('fulfillment_detail', { p_fulfillment_id: id });
  }

  assignees(locationId: string): Promise<FulfillmentAssignee[]> {
    return this.rpc('fulfillment_assignees', { p_location_id: locationId });
  }

  claim(id: string, version: number): Promise<{ state_version: number }> {
    return this.rpc('claim_fulfillment', {
      p_fulfillment_id: id,
      p_expected_version: version,
    });
  }

  assign(id: string, membershipId: string, version: number): Promise<{ state_version: number }> {
    return this.rpc('assign_fulfillment', {
      p_fulfillment_id: id,
      p_membership_id: membershipId,
      p_expected_version: version,
    });
  }

  startPreparation(id: string, version: number): Promise<{ state_version: number }> {
    return this.rpc('start_fulfillment_preparation', {
      p_fulfillment_id: id,
      p_expected_version: version,
    });
  }

  markReady(id: string, version: number): Promise<{ state_version: number }> {
    return this.rpc('mark_fulfillment_ready', {
      p_fulfillment_id: id,
      p_expected_version: version,
    });
  }

  reportFailure(id: string, version: number, reason: string): Promise<{ state_version: number }> {
    return this.rpc('report_fulfillment_failure', {
      p_fulfillment_id: id,
      p_expected_version: version,
      p_reason: reason,
    });
  }

  retry(id: string, version: number): Promise<{ state_version: number }> {
    return this.rpc('retry_fulfillment', {
      p_fulfillment_id: id,
      p_expected_version: version,
    });
  }

  cancel(
    id: string,
    version: number,
    reason: string
  ): Promise<{
    status: 'cancelled' | 'completed' | 'approval_required' | 'payment_resolution_required';
    fulfillment_status: FulfillmentStatus;
    state_version: number;
    approval_id?: string;
    collected_amount?: number;
    refunded_amount?: number;
  }> {
    return this.rpc('cancel_fulfillment', {
      p_fulfillment_id: id,
      p_expected_version: version,
      p_reason: reason,
    });
  }

  dispatch(id: string, version: number): Promise<{ state_version: number }> {
    return this.rpc('dispatch_fulfillment', {
      p_fulfillment_id: id,
      p_expected_version: version,
    });
  }

  complete(
    id: string,
    pin: string,
    version: number,
    overrideReason?: string
  ): Promise<{
    status: FulfillmentStatus | 'invalid_pin' | 'pin_locked';
    state_version: number;
    attempts_remaining?: number;
    locked_until?: string;
  }> {
    return this.rpc('complete_fulfillment', {
      p_fulfillment_id: id,
      p_pin: pin,
      p_expected_version: version,
      p_override_reason: overrideReason ?? null,
    });
  }

  collectCash(id: string, version: number): Promise<{ amount: number; balance: number }> {
    return this.rpc('collect_cod_cash', {
      p_fulfillment_id: id,
      p_expected_version: version,
    });
  }

  codBalance(id: string): Promise<number> {
    return this.rpc('fulfillment_cod_balance', { p_fulfillment_id: id });
  }

  regenerateAccess(
    id: string,
    version: number,
    regeneratePin = true
  ): Promise<{ tracking_token: string; pin: string | null; state_version: number }> {
    return this.rpc('regenerate_fulfillment_access', {
      p_fulfillment_id: id,
      p_expected_version: version,
      p_regenerate_pin: regeneratePin,
    });
  }

  holdings(locationId: string): Promise<CashHolding[]> {
    return this.rpc('cash_custody_holdings', { p_location_id: locationId });
  }

  remittances(locationId: string, status?: string): Promise<CashRemittance[]> {
    return this.rpc('cash_custody_remittances', {
      p_location_id: locationId,
      p_status: status ?? null,
      p_limit: 100,
    });
  }

  submitRemittance(locationId: string, paymentIds: string[]): Promise<{ remittance_id: string }> {
    return this.rpc('submit_cash_custody_remittance', {
      p_location_id: locationId,
      p_payment_ids: paymentIds,
    });
  }

  acceptRemittance(id: string): Promise<void> {
    return this.rpc('accept_cash_custody_remittance', { p_remittance_id: id });
  }

  rejectRemittance(id: string, reason: string): Promise<void> {
    return this.rpc('reject_cash_custody_remittance', {
      p_remittance_id: id,
      p_reason: reason,
    });
  }

  resolveShortage(id: string, receivedAmount: number, reason: string): Promise<void> {
    return this.rpc('resolve_cash_custody_shortage', {
      p_remittance_id: id,
      p_received_amount: receivedAmount,
      p_reason: reason,
    });
  }

  matchCustomers(
    phone: string
  ): Promise<Array<{ id: string; display_name: string; phone: string }>> {
    return this.rpc('match_checkout_customers', { p_phone: phone });
  }

  orderSummaries(orderIds: string[]): Promise<OrderFulfillmentSummary[]> {
    if (orderIds.length === 0) return Promise.resolve([]);
    return this.rpc('order_fulfillment_summaries', { p_order_ids: orderIds });
  }

  checkout(input: {
    locationId: string;
    customer: CheckoutCustomerInput;
    lines: SaleLineInput[];
    payments: PaymentInput[];
    fulfillment: FulfillmentCheckoutInput;
    clientRef: string;
    draftId?: string;
    approvalReason?: string;
  }): Promise<FulfillmentCheckoutResult> {
    return this.rpc('post_fulfillment_sale_at_location', {
      p_location_id: input.locationId,
      p_customer: input.customer as unknown as Json,
      p_lines: input.lines as unknown as Json,
      p_payments: input.payments as unknown as Json,
      p_fulfillment: input.fulfillment as unknown as Json,
      p_client_ref: input.clientRef,
      p_draft_id: input.draftId ?? null,
      p_approval_reason: input.approvalReason ?? null,
    });
  }

  async creditCheckout(input: {
    locationId: string;
    customerId: string;
    lines: SaleLineInput[];
    fulfillment: FulfillmentCheckoutInput;
    clientRef: string;
    draftId?: string;
    approvalReason?: string;
  }): Promise<PostSaleResult & { pin?: string | null }> {
    const result = await this.rpc<{
      status: 'completed' | 'approval_required';
      order_id: string;
      approval_id?: string;
      downpayment_applied?: number;
      credit_amount?: number;
      pin?: string | null;
    }>('post_fulfillment_credit_sale_at_location', {
      p_location_id: input.locationId,
      p_customer_id: input.customerId,
      p_lines: input.lines as unknown as Json,
      p_fulfillment: input.fulfillment as unknown as Json,
      p_client_ref: input.clientRef,
      p_draft_id: input.draftId ?? null,
      p_approval_reason: input.approvalReason ?? null,
    });
    const shared = {
      orderId: result.order_id,
      downpaymentApplied: Number(result.downpayment_applied ?? 0),
      creditAmount: Number(result.credit_amount ?? 0),
      pin: result.pin ?? null,
    };
    return result.status === 'approval_required'
      ? { status: result.status, approvalId: result.approval_id!, ...shared }
      : { status: result.status, ...shared };
  }

  offlineCheckout(input: {
    locationId: string;
    customer: CheckoutCustomerInput;
    lines: SaleLineInput[];
    payments: PaymentInput[];
    fulfillment: FulfillmentCheckoutInput;
    clientRef: string;
    occurredAt: string;
    deviceKey: string;
    pendingCount: number;
    draftId?: string;
  }): Promise<FulfillmentCheckoutResult> {
    return this.rpc('post_offline_fulfillment_sale_at_location', {
      p_location_id: input.locationId,
      p_customer: input.customer as unknown as Json,
      p_lines: input.lines as unknown as Json,
      p_payments: input.payments as unknown as Json,
      p_fulfillment: input.fulfillment as unknown as Json,
      p_client_ref: input.clientRef,
      p_occurred_at: input.occurredAt,
      p_device_key: input.deviceKey,
      p_pending_count: input.pendingCount,
      p_draft_id: input.draftId ?? null,
    });
  }

  async prepareMpesaCheckout(input: {
    locationId: string;
    customer: CheckoutCustomerInput;
    lines: SaleLineInput[];
    fulfillment: FulfillmentCheckoutInput;
    mpesaAmount: number;
    cashAmount: number;
    clientRef: string;
    draftId?: string;
    retry?: boolean;
    phone?: string;
    receipt?: string;
  }): Promise<string> {
    const { data, error } = await this.supabase.client.functions.invoke('mpesa-initiate', {
      body: {
        workflow: 'fulfillment_sale',
        location_id: input.locationId,
        customer: input.customer,
        lines: input.lines,
        fulfillment: input.fulfillment,
        amount: input.mpesaAmount,
        cash_amount: input.cashAmount,
        client_ref: input.clientRef,
        draft_id: input.draftId ?? null,
        retry: input.retry ?? false,
        ...(input.phone
          ? { phone: input.phone }
          : { mode: 'manual', receipt: input.receipt ?? '' }),
      },
    });
    if (error) throw error;
    const result = data as { intent_id?: string; message?: string; error?: string };
    if (!result.intent_id) {
      throw new Error(result.message ?? result.error ?? 'Could not start M-PESA');
    }
    return result.intent_id;
  }

  async prepareCodMpesa(input: {
    fulfillmentId: string;
    phone: string;
    mpesaAmount: number;
    cashAmount: number;
    clientRef: string;
    retry?: boolean;
  }): Promise<string> {
    const { data, error } = await this.supabase.client.functions.invoke('mpesa-initiate', {
      body: {
        workflow: 'cod_order',
        fulfillment_id: input.fulfillmentId,
        phone: input.phone,
        amount: input.mpesaAmount,
        cash_amount: input.cashAmount,
        client_ref: input.clientRef,
        retry: input.retry ?? false,
      },
    });
    if (error) throw error;
    const result = data as { intent_id?: string; message?: string; error?: string };
    if (!result.intent_id)
      throw new Error(result.message ?? result.error ?? 'Could not start M-PESA');
    return result.intent_id;
  }

  finalizeCodMpesaCash(intentId: string): Promise<void> {
    return this.rpc('finalize_cod_mpesa_cash_split', { p_intent_id: intentId });
  }

  pendingCodSplit(fulfillmentId: string): Promise<PendingCodSplit | null> {
    return this.rpc('cod_pending_split', { p_fulfillment_id: fulfillmentId });
  }
}
