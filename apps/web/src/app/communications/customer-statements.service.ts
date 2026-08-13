import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../core/supabase.service';
import { rpcError } from '../pos/pos.service';

export type CustomerStatementChannel = 'sms' | 'whatsapp';

export interface CustomerStatementPreview {
  party_name: string;
  recipient: string;
  account_balance: number;
  account_summary: string;
  body: string;
  expires_in_days: number;
}

export interface CustomerStatementSendResult {
  queued: boolean;
  outbox_id: string;
  recipient: string;
  body: string;
  expires_at: string;
}

@Injectable({ providedIn: 'root' })
export class CustomerStatementsService {
  private readonly supabase = inject(SupabaseService);

  async preview(
    customerId: string,
    channel: CustomerStatementChannel
  ): Promise<CustomerStatementPreview> {
    const { data, error } = await this.supabase.client.rpc('preview_customer_statement', {
      p_customer_id: customerId,
      p_channel: channel,
    });
    if (error) throw rpcError(error);
    return data as unknown as CustomerStatementPreview;
  }

  async send(
    customerId: string,
    channel: CustomerStatementChannel,
    bypassQuietHours = false
  ): Promise<CustomerStatementSendResult> {
    const { data, error } = await this.supabase.client.rpc('send_customer_statement', {
      p_customer_id: customerId,
      p_channel: channel,
      p_bypass_quiet_hours: bypassQuietHours,
    });
    if (error) throw rpcError(error);
    return data as unknown as CustomerStatementSendResult;
  }
}
