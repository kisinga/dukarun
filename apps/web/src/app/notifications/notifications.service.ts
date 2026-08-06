import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Database } from '@dukarun/shared-types';
import { SupabaseService } from '../core/supabase.service';
import { rpcError } from '../pos/pos.service';

export type AppNotification = Database['public']['Tables']['notifications']['Row'];
export type OutboxMessage = Database['public']['Tables']['outbox']['Row'];

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
  async smsUsage(): Promise<{ used: number; limit: number | null }> {
    const { data, error } = await this.db
      .from('companies')
      .select('sms_used_this_period, subscription_tiers(sms_per_period)')
      .limit(1)
      .single();
    if (error) throw error;
    const tier = data.subscription_tiers as { sms_per_period: number | null } | null;
    return { used: data.sms_used_this_period, limit: tier?.sms_per_period ?? null };
  }
}
