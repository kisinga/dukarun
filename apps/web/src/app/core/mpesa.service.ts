import { Injectable, effect, inject, signal } from '@angular/core';
import { LocationContextService } from './location-context.service';
import { SupabaseService } from './supabase.service';
import type { SaleLineInput } from '../pos/pos.service';

export type MpesaIntentStatus =
  | 'created'
  | 'requesting'
  | 'pending'
  | 'funds_received'
  | 'awaiting_cash'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'failed'
  | 'manual_review';

export interface MpesaAvailability {
  active: boolean;
  manualFallback: boolean;
  status: string | null;
}

export interface MpesaIntentResult {
  id: string;
  subject_id: string;
  status: MpesaIntentStatus;
  result_code: string | null;
  result_description: string | null;
  provider_receipt: string | null;
  cash_amount: number;
  amount: number;
  retry_allowed: boolean;
}

type PaymentSource = { phone: string; receipt?: never } | { receipt: string; phone?: never };

async function mpesaFunctionError(error: unknown): Promise<Error> {
  let message = error instanceof Error ? error.message : 'Could not start M-PESA payment';
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    const body = (await context
      .clone()
      .json()
      .catch(() => null)) as { message?: string; error?: string } | null;
    message = body?.message ?? body?.error ?? message;
  }

  const friendlyMessages: Record<string, string> = {
    mpesa_callback_url_not_configured:
      'M-PESA checkout is not fully deployed yet. Use another payment method.',
    invalid_mpesa_phone: 'Enter a valid Safaricom phone number, for example 0712345678.',
    mpesa_not_available: 'M-PESA is not available at this location.',
    active_mpesa_connection_required: 'M-PESA is not live at this location yet.',
    manual_fallback_not_available: 'Receipt fallback is not available. Use STK or another method.',
  };
  return new Error(friendlyMessages[message] ?? message.replaceAll('_', ' '));
}

@Injectable({ providedIn: 'root' })
export class MpesaService {
  private readonly supabase = inject(SupabaseService);
  private readonly locations = inject(LocationContextService);
  readonly availability = signal<MpesaAvailability>({
    active: false,
    manualFallback: false,
    status: null,
  });

  constructor() {
    effect(() => {
      void this.refreshAvailability(this.locations.activeId());
    });
  }

  async refreshAvailability(locationId = this.locations.activeId()): Promise<MpesaAvailability> {
    if (!locationId) {
      const unavailable = { active: false, manualFallback: false, status: null };
      this.availability.set(unavailable);
      return unavailable;
    }
    const { data, error } = await this.supabase.client.rpc('mpesa_availability', {
      p_location_id: locationId,
    });
    if (error) {
      const unavailable = { active: false, manualFallback: false, status: null };
      this.availability.set(unavailable);
      return unavailable;
    }
    const value = data as unknown as {
      active: boolean;
      manual_fallback: boolean;
      status: string | null;
    };
    const result = {
      active: Boolean(value.active),
      manualFallback: Boolean(value.manual_fallback),
      status: value.status,
    };
    this.availability.set(result);
    return result;
  }

  initiateSale(
    input: {
      locationId: string;
      customerId: string | null;
      lines: SaleLineInput[];
      mpesaAmount: number;
      cashAmount: number;
      clientRef: string;
      draftId?: string;
      retry?: boolean;
    } & PaymentSource
  ): Promise<string> {
    return this.initiate({
      workflow: 'sale',
      location_id: input.locationId,
      customer_id: input.customerId,
      lines: input.lines,
      amount: input.mpesaAmount,
      cash_amount: input.cashAmount,
      client_ref: input.clientRef,
      draft_id: input.draftId ?? null,
      retry: input.retry ?? false,
      ...(input.phone ? { phone: input.phone } : { mode: 'manual', receipt: input.receipt }),
    });
  }

  initiateOrder(
    input: {
      orderId: string;
      locationId: string;
      mpesaAmount: number;
      cashAmount: number;
      clientRef: string;
      retry?: boolean;
    } & PaymentSource
  ): Promise<string> {
    return this.initiate({
      workflow: 'order',
      order_id: input.orderId,
      location_id: input.locationId,
      amount: input.mpesaAmount,
      cash_amount: input.cashAmount,
      client_ref: input.clientRef,
      retry: input.retry ?? false,
      ...(input.phone ? { phone: input.phone } : { mode: 'manual', receipt: input.receipt }),
    });
  }

  initiateCustomerReceipt(
    input: {
      customerId: string;
      locationId: string;
      amount: number;
      clientRef: string;
      retry?: boolean;
    } & PaymentSource
  ): Promise<string> {
    return this.initiate({
      workflow: 'customer_receipt',
      customer_id: input.customerId,
      location_id: input.locationId,
      amount: input.amount,
      cash_amount: 0,
      client_ref: input.clientRef,
      retry: input.retry ?? false,
      ...(input.phone ? { phone: input.phone } : { mode: 'manual', receipt: input.receipt }),
    });
  }

  private async initiate(body: Record<string, unknown>): Promise<string> {
    const { data, error } = await this.supabase.client.functions.invoke('mpesa-initiate', { body });
    if (error) throw await mpesaFunctionError(error);
    const result = data as { intent_id?: string; message?: string; error?: string };
    if (!result.intent_id)
      throw new Error(result.message ?? result.error ?? 'Could not start M-PESA payment');
    return result.intent_id;
  }

  async waitForResult(intentId: string, timeoutMs = 105_000): Promise<MpesaIntentResult> {
    const started = Date.now();
    while (true) {
      const { data, error } = await this.supabase.client.rpc('mpesa_intent_status', {
        p_intent_id: intentId,
      });
      if (error) throw error;
      const result = data as unknown as MpesaIntentResult;
      if (!['created', 'requesting', 'pending', 'funds_received'].includes(result.status))
        return result;
      if (Date.now() - started >= timeoutMs) return result;
      await new Promise(resolve => setTimeout(resolve, 2_000));
    }
  }

  async finalizeCashSplit(intentId: string): Promise<string> {
    const { data, error } = await this.supabase.client.rpc('finalize_mpesa_cash_split', {
      p_intent_id: intentId,
    });
    if (error) throw error;
    return String(data);
  }
}
