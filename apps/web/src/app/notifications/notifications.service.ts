import { Injectable, OnDestroy, effect, inject, signal, untracked } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Database } from '@dukarun/shared-types';
import { SupabaseService } from '../core/supabase.service';
import { ConnectivityService } from '../pos/offline/connectivity.service';
import { offlineDb, offlineScopeKey, type NamedSnapshot } from '../pos/offline/offline-db';
import {
  CacheJournalService,
  type CacheChange,
  type CacheStreamHandler,
} from '../core/cache-journal.service';

export type AppNotification = Database['public']['Tables']['notifications']['Row'];
export type OutboxMessage = Database['public']['Tables']['outbox']['Row'];
export type OutboxMessageWithParty = OutboxMessage & {
  customers: Pick<
    Database['public']['Tables']['customers']['Row'],
    'id' | 'first_name' | 'last_name' | 'is_supplier'
  > | null;
};

/** Notifications inbox + live unread count (table is realtime-published). */
@Injectable({ providedIn: 'root' })
export class NotificationsService implements OnDestroy {
  private readonly supabase = inject(SupabaseService);
  private readonly connectivity = inject(ConnectivityService);
  private readonly journal = inject(CacheJournalService);

  readonly notifications = signal<AppNotification[]>([]);
  readonly unreadCount = signal(0);

  private channel: RealtimeChannel | null = null;
  private scope: string | null = null;
  private handler: CacheStreamHandler | null = null;

  private get db() {
    return this.supabase.client;
  }

  constructor() {
    effect(() => {
      const identity = this.supabase.offlineIdentity();
      const online = this.connectivity.online();
      untracked(() => {
        const scope = identity ? offlineScopeKey(identity) : null;
        if (scope !== this.scope) {
          if (this.channel) void this.db.removeChannel(this.channel);
          this.channel = null;
          this.scope = scope;
          this.notifications.set([]);
          this.unreadCount.set(0);
          this.handler = null;
          if (identity && scope) void this.start(identity.companyId, scope).catch(() => undefined);
        }
        if (online && scope && this.handler) {
          void this.journal.reconcile('inbox', scope, this.handler, 'notifications');
        }
      });
    });
  }

  ngOnDestroy(): void {
    if (this.channel) void this.db.removeChannel(this.channel);
  }

  async refresh(expectedScope: string | null = this.scope): Promise<void> {
    if (!expectedScope) return;
    const { data, error } = await this.db
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    if (expectedScope !== this.scope) throw new Error('cache_scope_changed');
    await this.persist(data, expectedScope);
    if (expectedScope !== this.scope) throw new Error('cache_scope_changed');
    this.applyRows(data);
  }

  /** The column-limited grant allows ONLY read_at updates. */
  async markRead(id: string): Promise<void> {
    const scope = this.scope;
    if (!scope) return;
    const { error } = await this.db
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
    if (scope !== this.scope) return;
    this.notifications.update(rows =>
      rows.map(row => (row.id === id ? { ...row, read_at: new Date().toISOString() } : row))
    );
    this.unreadCount.set(this.notifications().filter(row => row.read_at === null).length);
    await this.persist(this.notifications(), scope);
  }

  async markAllRead(): Promise<void> {
    const scope = this.scope;
    if (!scope) return;
    const { error } = await this.db
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .is('read_at', null);
    if (error) throw new Error(error.message);
    if (scope !== this.scope) return;
    const readAt = new Date().toISOString();
    this.notifications.update(rows =>
      rows.map(row => ({ ...row, read_at: row.read_at ?? readAt }))
    );
    this.unreadCount.set(0);
    await this.persist(this.notifications(), scope);
  }

  private async start(companyId: string, scope: string): Promise<void> {
    const cached = await (await offlineDb()).get('snapshots', `${scope}:inbox`);
    if (scope !== this.scope) return;
    if (cached) this.applyRows(cached.value as AppNotification[]);
    this.handler = {
      apply: changes => this.applyChanges(changes),
      reset: async () => {
        await this.refresh(scope);
        return true;
      },
    };
    this.channel = this.journal.subscribe('inbox', scope, companyId, this.handler, 'notifications');
    if (!cached && this.connectivity.online()) await this.refresh(scope);
  }

  private async applyChanges(changes: readonly CacheChange[]): Promise<void> {
    const scope = this.scope;
    if (!scope) throw new Error('cache_scope_changed');
    const ids = [
      ...new Set(changes.filter(row => row.entityType === 'notification').map(row => row.entityId)),
    ];
    if (!ids.length) return;
    const { data, error } = await this.db.from('notifications').select('*').in('id', ids);
    if (error) throw error;
    if (scope !== this.scope) throw new Error('cache_scope_changed');
    const idSet = new Set(ids);
    const rows = this.notifications().filter(row => !idSet.has(row.id));
    rows.push(...(data ?? []));
    rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    const limited = rows.slice(0, 50);
    await this.persist(limited, scope);
    if (scope !== this.scope) throw new Error('cache_scope_changed');
    this.applyRows(limited);
  }

  private applyRows(rows: AppNotification[]): void {
    this.notifications.set(rows);
    this.unreadCount.set(rows.filter(row => row.read_at === null).length);
  }

  private async persist(rows: AppNotification[], expectedScope: string): Promise<void> {
    const db = await offlineDb();
    const identity = this.supabase.offlineIdentity();
    const currentScope = identity ? offlineScopeKey(identity) : null;
    if (!identity || expectedScope !== this.scope || expectedScope !== currentScope) {
      throw new Error('cache_scope_changed');
    }
    const snapshot: NamedSnapshot = {
      key: `${expectedScope}:inbox`,
      name: 'inbox',
      company_id: identity.companyId,
      user_id: identity.userId,
      value: rows,
      fetched_at: new Date().toISOString(),
    };
    await db.put('snapshots', snapshot);
  }

  async recentOutbox(limit = 20): Promise<OutboxMessageWithParty[]> {
    const { data, error } = await this.db
      .from('outbox')
      .select('*, customers(id, first_name, last_name, is_supplier)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data as OutboxMessageWithParty[];
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
}
