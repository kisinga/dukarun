import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from '../core/supabase.service';
import { rpcError } from '../pos/pos.service';
import { normalizeKenyanPhone } from '../core/phone';

export interface ReceiptContact {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  is_verified: boolean;
  customer_origin: string;
  updated_at: string;
}
export type DocumentDeliveryState =
  'queued' | 'preparing' | 'sending' | 'sent' | 'failed' | 'unknown' | 'cancelled';
export interface SaleDocumentContext {
  order_id: string;
  document_number: string;
  total: number;
  paid: number;
  balance: number;
  document_type: 'receipt' | 'invoice';
  eligible: boolean;
  has_customer: boolean;
  customer: ReceiptContact | null;
  can_correct_number: boolean;
  delivery: {
    id: string;
    state: DocumentDeliveryState;
    recipient: string;
    sent_at: string | null;
    error: string | null;
  } | null;
}
@Injectable({ providedIn: 'root' })
export class SaleDocumentService {
  private readonly db = inject(SupabaseService).client;
  readonly modal = signal<{
    orderId: string;
    celebrate: boolean;
    total?: number;
    code?: string;
  } | null>(null);

  open(orderId: string, celebrate = false, total?: number, code?: string): void {
    this.modal.set({ orderId, celebrate, total, code });
  }
  /** Use the checkout acknowledgement; loading document details must not hide a completed sale. */
  offerCompleted(orderId: string, status: string, total?: number): void {
    if (status === 'completed') this.open(orderId, true, total);
  }
  async context(orderId: string): Promise<SaleDocumentContext> {
    const { data, error } = await this.db.rpc('sale_document_context', { p_order_id: orderId });
    if (error) throw rpcError(error);
    return data as unknown as SaleDocumentContext;
  }
  async lookup(phone: string): Promise<ReceiptContact | null> {
    const normalized = normalizeKenyanPhone(phone);
    if (!normalized) throw new Error('Enter a valid Kenyan mobile number.');
    const { data, error } = await this.db.rpc('lookup_receipt_contact', { p_phone: normalized });
    if (error) throw rpcError(error);
    return data as unknown as ReceiptContact | null;
  }
  async correctPhone(contact: ReceiptContact, phone: string): Promise<ReceiptContact> {
    const normalized = normalizeKenyanPhone(phone);
    if (!normalized) throw new Error('Enter a valid Kenyan mobile number.');
    const { data, error } = await this.db.rpc('correct_receipt_customer_phone', {
      p_customer_id: contact.id,
      p_phone: normalized,
      p_expected_updated_at: contact.updated_at,
    });
    if (error) throw rpcError(error);
    return data as unknown as ReceiptContact;
  }
  async send(
    orderId: string,
    requestKey: string,
    contact?: { phone: string; first_name: string; last_name: string }
  ) {
    const { data, error } = await this.db.functions.invoke('sale-document-send', {
      body: { order_id: orderId, request_key: requestKey, ...contact },
    });
    if (error) {
      const result = await error.context?.json?.().catch(() => null);
      throw new Error(
        result?.error ?? 'Could not confirm acceptance. Retry to check the same request.'
      );
    }
    return data as { outbox_id: string; state: DocumentDeliveryState };
  }
}
