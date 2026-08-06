import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Database } from '@dukarun/shared-types';
import { SupabaseService } from '../core/supabase.service';
import { rpcError } from '../pos/pos.service';

export type Approval = Database['public']['Tables']['approvals']['Row'];

/**
 * Approvals inbox data. `pending` is kept live via a realtime subscription
 * (the approvals table is published) once any screen injects this service.
 */
@Injectable({ providedIn: 'root' })
export class ApprovalsService implements OnDestroy {
  private readonly supabase = inject(SupabaseService);

  readonly pending = signal<Approval[]>([]);
  readonly decided = signal<Approval[]>([]);

  private channel: RealtimeChannel | null = null;

  private get db() {
    return this.supabase.client;
  }

  constructor() {
    void this.refresh();
    this.channel = this.db
      .channel('approvals-inbox')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'approvals' },
        () => void this.refresh()
      )
      .subscribe();
  }

  ngOnDestroy(): void {
    if (this.channel) void this.db.removeChannel(this.channel);
  }

  async refresh(): Promise<void> {
    const [pending, decided] = await Promise.all([
      this.db.from('approvals').select('*').eq('status', 'pending').order('created_at').limit(100),
      this.db
        .from('approvals')
        .select('*')
        .neq('status', 'pending')
        .order('decided_at', { ascending: false })
        .limit(20),
    ]);
    if (!pending.error) this.pending.set(pending.data);
    if (!decided.error) this.decided.set(decided.data);
  }

  /** ManageApprovals-gated; approving an order_reversal executes the void. */
  async approve(approvalId: string, reason?: string): Promise<void> {
    const { error } = await this.db.rpc('approve_request', {
      p_approval_id: approvalId,
      ...(reason ? { p_reason: reason } : {}),
    });
    if (error) throw rpcError(error);
    await this.refresh();
  }

  async deny(approvalId: string, reason: string): Promise<void> {
    const { error } = await this.db.rpc('deny_request', {
      p_approval_id: approvalId,
      p_reason: reason,
    });
    if (error) throw rpcError(error);
    await this.refresh();
  }

  /** Order codes for summary lines (client-side join from metadata order ids). */
  async orderCodes(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const { data, error } = await this.db.from('orders').select('id, code').in('id', ids);
    if (error) throw error;
    return new Map((data ?? []).map(o => [o.id, o.code]));
  }
}
