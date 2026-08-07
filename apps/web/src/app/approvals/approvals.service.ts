import { Injectable, OnDestroy, effect, inject, signal } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Database } from '@dukarun/shared-types';
import { SupabaseService } from '../core/supabase.service';
import { rpcError } from '../pos/pos.service';
import { PermissionsService } from '../core/permissions.service';

export type Approval = Database['public']['Tables']['approvals']['Row'];

/**
 * Approvals inbox data. `pending` is kept live via a realtime subscription
 * (the approvals table is published) once any screen injects this service.
 */
@Injectable({ providedIn: 'root' })
export class ApprovalsService implements OnDestroy {
  private readonly supabase = inject(SupabaseService);
  private readonly permissions = inject(PermissionsService);

  readonly pending = signal<Approval[]>([]);
  readonly decided = signal<Approval[]>([]);
  readonly revision = signal(0);
  readonly error = signal<string | null>(null);

  private channel: RealtimeChannel | null = null;
  private refreshSequence = 0;

  private get db() {
    return this.supabase.client;
  }

  constructor() {
    effect(() => {
      const identity = this.supabase.offlineIdentity();
      const canReadInbox = this.permissions.ready() && this.permissions.has('ManageApprovals');
      this.stopRealtime();
      this.pending.set([]);
      this.decided.set([]);
      this.error.set(null);
      this.refreshSequence++;
      if (!identity) return;
      if (canReadInbox) this.refreshSafely();
      this.channel = this.db
        .channel(`approvals-inbox:${identity.companyId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'approvals',
            filter: `company_id=eq.${identity.companyId}`,
          },
          () => {
            this.revision.update(value => value + 1);
            if (canReadInbox) this.refreshSafely();
          }
        )
        .subscribe();
    });
  }

  ngOnDestroy(): void {
    this.stopRealtime();
  }

  async refresh(): Promise<void> {
    if (!this.permissions.ready() || !this.permissions.has('ManageApprovals')) {
      this.pending.set([]);
      this.decided.set([]);
      return;
    }
    const sequence = ++this.refreshSequence;
    const [pending, decided] = await Promise.all([
      this.db.from('approvals').select('*').eq('status', 'pending').order('created_at').limit(100),
      this.db
        .from('approvals')
        .select('*')
        .neq('status', 'pending')
        .order('decided_at', { ascending: false })
        .limit(20),
    ]);
    if (sequence !== this.refreshSequence) return;
    if (pending.error) throw rpcError(pending.error);
    if (decided.error) throw rpcError(decided.error);
    this.pending.set(pending.data);
    this.decided.set(decided.data);
    this.error.set(null);
  }

  /** Requester-visible lookup used to show pending state and prevent duplicates. */
  async pendingFor(type: Approval['type'], subjectId: string): Promise<Approval | null> {
    const { data, error } = await this.db
      .from('approvals')
      .select('*')
      .eq('type', type)
      .eq('subject_id', subjectId)
      .eq('status', 'pending')
      .maybeSingle();
    if (error) throw rpcError(error);
    return data;
  }

  async pendingForSubjects(
    subjects: ReadonlyArray<{ type: Approval['type']; subjectId: string }>
  ): Promise<Approval[]> {
    if (subjects.length === 0) return [];
    const ids = [...new Set(subjects.map(subject => subject.subjectId))];
    const types = [...new Set(subjects.map(subject => subject.type))];
    const expected = new Set(subjects.map(subject => `${subject.type}:${subject.subjectId}`));
    const { data, error } = await this.db
      .from('approvals')
      .select('*')
      .in('type', types)
      .in('subject_id', ids)
      .eq('status', 'pending');
    if (error) throw rpcError(error);
    return data.filter(approval => expected.has(`${approval.type}:${approval.subject_id}`));
  }

  async byId(approvalId: string): Promise<Approval> {
    const { data, error } = await this.db
      .from('approvals')
      .select('*')
      .eq('id', approvalId)
      .single();
    if (error) throw rpcError(error);
    return data;
  }

  async forOrder(orderId: string): Promise<Approval[]> {
    const { data, error } = await this.db
      .from('approvals')
      .select('*')
      .contains('metadata', { order_id: orderId })
      .order('created_at', { ascending: false });
    if (error) throw rpcError(error);
    return data;
  }

  async forOrders(orderIds: string[]): Promise<Approval[]> {
    if (orderIds.length === 0) return [];
    const filters = orderIds.map(id => `metadata->>order_id.eq.${id}`).join(',');
    const { data, error } = await this.db
      .from('approvals')
      .select('*')
      .or(filters)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw rpcError(error);
    return data;
  }

  async staffNames(userIds: Array<string | null>): Promise<Map<string, string>> {
    const ids = [...new Set(userIds.filter((id): id is string => !!id))];
    if (ids.length === 0) return new Map();
    const { data, error } = await this.db
      .from('company_staff_profiles')
      .select('user_id, display_name')
      .in('user_id', ids);
    if (error) throw rpcError(error);
    return new Map(data.map(profile => [profile.user_id, profile.display_name]));
  }

  /** ManageApprovals-gated; approving an order_reversal executes the void. */
  async approve(approvalId: string, reason?: string): Promise<Approval['status']> {
    const { error } = await this.db.rpc('approve_request', {
      p_approval_id: approvalId,
      ...(reason ? { p_reason: reason } : {}),
    });
    if (error) throw rpcError(error);
    const decision = await this.db.from('approvals').select('status').eq('id', approvalId).single();
    if (decision.error) throw rpcError(decision.error);
    await this.refresh();
    return decision.data.status;
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

  private stopRealtime(): void {
    if (!this.channel) return;
    void this.db.removeChannel(this.channel);
    this.channel = null;
  }

  private refreshSafely(): void {
    void this.refresh().catch(error => {
      this.error.set(error instanceof Error ? error.message : 'Failed to load approvals');
    });
  }
}
