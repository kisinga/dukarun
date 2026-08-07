import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Database } from '@dukarun/shared-types';
import { SupabaseService } from '../core/supabase.service';
import { rpcError } from '../pos/pos.service';

export type AppNotification = Database['public']['Tables']['notifications']['Row'];
export type OutboxMessage = Database['public']['Tables']['outbox']['Row'];
export type MessageCampaign = Database['public']['Tables']['message_campaigns']['Row'];
export type MessageTemplate = Database['public']['Tables']['message_templates']['Row'];
export interface CampaignPreview {
  total: number;
  eligible: number;
  skipped: number;
  units: number;
  limit: number | null;
  used: number;
  reserved: number;
  remaining: number | null;
}
export interface MessagingCustomer {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
}

/** Notifications inbox + live unread count (table is realtime-published). */
@Injectable({ providedIn: 'root' })
export class NotificationsService implements OnDestroy {
  private readonly supabase = inject(SupabaseService);

  readonly notifications = signal<AppNotification[]>([]);
  readonly unreadCount = signal(0);

  private channel: RealtimeChannel | null = null;

  private get db() {
    return this.supabase.client;
  }

  constructor() {
    void this.refresh();
    this.channel = this.db
      .channel('notifications-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        () => void this.refresh()
      )
      .subscribe();
  }

  ngOnDestroy(): void {
    if (this.channel) void this.db.removeChannel(this.channel);
  }

  async refresh(): Promise<void> {
    const { data, error } = await this.db
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return;
    this.notifications.set(data);
    this.unreadCount.set(data.filter(n => n.read_at === null).length);
  }

  /** The column-limited grant allows ONLY read_at updates. */
  async markRead(id: string): Promise<void> {
    const { error } = await this.db
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
    await this.refresh();
  }

  async markAllRead(): Promise<void> {
    const { error } = await this.db
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .is('read_at', null);
    if (error) throw new Error(error.message);
    await this.refresh();
  }

  // --- Batch messaging ---

  async queueBatchMessage(
    channel: 'sms' | 'whatsapp',
    body: string,
    audience: 'all' | 'credit_overdue'
  ): Promise<number> {
    const { data, error } = await this.db.rpc('queue_batch_message', {
      p_channel: channel,
      p_body: body,
      p_audience: audience,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async previewCampaign(
    channel: 'sms' | 'whatsapp',
    body: string,
    audience: 'all' | 'overdue' | 'credit_approved' | 'selected',
    customerIds?: string[]
  ): Promise<CampaignPreview> {
    const { data, error } = await this.db.rpc('campaign_preview', {
      p_channel: channel,
      p_body: body,
      p_audience: audience,
      ...(customerIds?.length ? { p_customer_ids: customerIds } : {}),
    });
    if (error) throw rpcError(error);
    return data as unknown as CampaignPreview;
  }

  async createAndSendCampaign(input: {
    name: string;
    channel: 'sms' | 'whatsapp';
    body: string;
    audience: 'all' | 'overdue' | 'credit_approved' | 'selected';
    customerIds?: string[];
    templateId?: string;
  }): Promise<number> {
    const created = await this.db.rpc('create_message_campaign', {
      p_name: input.name,
      p_channel: input.channel,
      p_body: input.body,
      p_audience: input.audience,
      ...(input.customerIds?.length ? { p_customer_ids: input.customerIds } : {}),
      ...(input.templateId ? { p_template_id: input.templateId } : {}),
    });
    if (created.error) throw rpcError(created.error);
    const sent = await this.db.rpc('send_message_campaign', { p_campaign_id: created.data });
    if (sent.error) throw rpcError(sent.error);
    return Number((sent.data as { queued?: number } | null)?.queued ?? 0);
  }

  async messagingCustomers(): Promise<MessagingCustomer[]> {
    const { data, error } = await this.db
      .from('customers')
      .select('id, first_name, last_name, phone')
      .eq('is_supplier', false)
      .order('first_name')
      .limit(500);
    if (error) throw error;
    return data;
  }

  async recentCampaigns(): Promise<MessageCampaign[]> {
    const { data, error } = await this.db
      .from('message_campaigns')
      .select('*')
      .eq('scope', 'company')
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw error;
    return data;
  }

  async setCampaignStatus(
    campaignId: string,
    action: 'pause' | 'resume' | 'cancel'
  ): Promise<void> {
    const { error } = await this.db.rpc('set_campaign_status', {
      p_campaign_id: campaignId,
      p_action: action,
    });
    if (error) throw rpcError(error);
  }

  async retryFailedCampaignRecipients(campaignId: string): Promise<number> {
    const { data, error } = await this.db.rpc('retry_failed_campaign_recipients', {
      p_campaign_id: campaignId,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async messageTemplates(): Promise<MessageTemplate[]> {
    const { data, error } = await this.db
      .from('message_templates')
      .select('*')
      .eq('context', 'customer')
      .order('is_system', { ascending: false })
      .order('name');
    if (error) throw error;
    return data;
  }

  async saveMessageTemplate(
    name: string,
    smsBody: string,
    whatsappBody: string,
    templateId?: string
  ): Promise<string> {
    const key = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const { data, error } = await this.db.rpc('upsert_message_template', {
      p_template_key: key,
      p_name: name.trim(),
      p_context: 'customer',
      p_sms_body: smsBody,
      p_whatsapp_body: whatsappBody,
      ...(templateId ? { p_template_id: templateId } : {}),
    });
    if (error) throw rpcError(error);
    return data;
  }

  async testMessageTemplate(
    templateId: string,
    channel: 'sms' | 'whatsapp',
    recipient: string
  ): Promise<void> {
    const { error } = await this.db.rpc('test_message_template', {
      p_template_id: templateId,
      p_channel: channel,
      p_recipient: recipient,
    });
    if (error) throw rpcError(error);
  }

  async recentOutbox(limit = 20): Promise<OutboxMessage[]> {
    const { data, error } = await this.db
      .from('outbox')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  }

  /** SMS usage + cap for the meter. */
  async communicationUsage(): Promise<{
    sms: { used: number; reserved: number; limit: number | null };
    whatsapp: { used: number; reserved: number; limit: number | null };
  }> {
    const { data, error } = await this.db
      .from('companies')
      .select(
        'sms_used_this_period, sms_reserved_this_period, whatsapp_used_this_period, whatsapp_reserved_this_period, subscription_tiers(sms_per_period, whatsapp_per_period)'
      )
      .limit(1)
      .single();
    if (error) throw error;
    const tier = data.subscription_tiers as {
      sms_per_period: number | null;
      whatsapp_per_period: number | null;
    } | null;
    return {
      sms: {
        used: data.sms_used_this_period,
        reserved: data.sms_reserved_this_period,
        limit: tier?.sms_per_period ?? null,
      },
      whatsapp: {
        used: data.whatsapp_used_this_period,
        reserved: data.whatsapp_reserved_this_period,
        limit: tier?.whatsapp_per_period ?? null,
      },
    };
  }

  async smsUsage(): Promise<{ used: number; limit: number | null }> {
    const usage = await this.communicationUsage();
    return { used: usage.sms.used + usage.sms.reserved, limit: usage.sms.limit };
  }
}
