import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { AppIdentity } from './supabase.service';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { offlineDb, offlineScopeKey, type NamedSnapshot } from '../pos/offline/offline-db';
import { CacheJournalService, type CacheStreamHandler } from './cache-journal.service';

/** Assignable permissions (role editor checkboxes; mirrored in the DB role templates). */
export const ALL_PERMISSIONS = [
  'ManageApprovals',
  'OverridePrice',
  'ManageStockAdjustments',
  'ApproveCustomerCredit',
  'ManageCustomerCreditLimit',
  'ManageCustomers',
  'ManageCatalog',
  'ManageCommunications',
  'ManageMpesaIntegration',
  'ReverseOrder',
  'OverrideCustomerBalance',
  'SettleOrder',
  'ManageSupplierCreditPurchases',
  'ViewFinancials',
  'ManageReconciliation',
  'CloseAccountingPeriod',
  'CreateInterAccountTransfer',
  'ManageTeam',
  'ViewAuditTrail',
  'ViewStaffPerformance',
  'ManageCommissions',
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];
export type ActionKey =
  | 'sale.void'
  | 'sale.refund'
  | 'payment.reverse'
  | 'sale.credit_over_limit'
  | 'customer.credit.update';
export type ActionMode = 'execute' | 'request' | 'blocked';
export type AccessState = 'loading' | 'ready' | 'error';

type AccessSnapshot = {
  company_id: string;
  user_id: string;
  permissions: Permission[];
  actions: Record<ActionKey, ActionMode>;
};

export const PERMISSION_LABELS: Record<Permission, string> = {
  ManageApprovals: 'Manage approvals',
  OverridePrice: 'Override prices',
  ManageStockAdjustments: 'Manage stock adjustments',
  ApproveCustomerCredit: 'Approve customer credit',
  ManageCustomerCreditLimit: 'Manage customer credit limits',
  ManageCustomers: 'Manage customers',
  ManageCatalog: 'Manage product catalog',
  ManageCommunications: 'Manage payment reminders and view communications',
  ManageMpesaIntegration: 'Manage M-PESA integration',
  ReverseOrder: 'Reverse sales',
  OverrideCustomerBalance: 'Override customer balances',
  SettleOrder: 'Settle sales',
  ManageSupplierCreditPurchases: 'Manage supplier credit',
  ViewFinancials: 'View financials',
  ManageReconciliation: 'Manage reconciliation',
  CloseAccountingPeriod: 'Close accounting periods',
  CreateInterAccountTransfer: 'Transfer between accounts',
  ManageTeam: 'Manage team',
  ViewAuditTrail: 'View audit trail',
  ViewStaffPerformance: 'View staff performance',
  ManageCommissions: 'Manage commissions',
};

/**
 * Current user's permission set (The Counter — people see only what their role allows).
 * Source of truth is the DB: RLS already gates financial reads server-side; this service
 * mirrors that in the UI (hide nav, mask amounts) via the same current_user_has_permission()
 * function the policies use. Fails closed: until loaded, nothing is granted.
 */
@Injectable({ providedIn: 'root' })
export class PermissionsService {
  private readonly supabase = inject(SupabaseService);
  private readonly journal = inject(CacheJournalService);

  private readonly granted = signal<ReadonlySet<Permission>>(new Set());
  private readonly actions = signal<Readonly<Record<ActionKey, ActionMode>>>({
    'sale.void': 'blocked',
    'sale.refund': 'blocked',
    'payment.reverse': 'blocked',
    'sale.credit_over_limit': 'blocked',
    'customer.credit.update': 'blocked',
  });
  readonly state = signal<AccessState>('loading');
  readonly error = signal<string | null>(null);
  readonly ready = computed(() => {
    const identity = this.supabase.offlineIdentity();
    const key = this.contextKeyFor(identity, this.supabase.session()?.access_token ?? null);
    return this.state() === 'ready' && key !== null && key === this.contextKey;
  });

  private sequence = 0;
  private currentLoad: Promise<void> | null = null;
  private contextKey: string | null = null;
  private teamScope: string | null = null;
  private teamChannel: RealtimeChannel | null = null;
  private teamHandler: CacheStreamHandler | null = null;
  private teamIdentity: AppIdentity | null = null;

  constructor() {
    effect(() => {
      const identity = this.supabase.offlineIdentity();
      const accessToken = this.supabase.session()?.access_token ?? null;
      void this.loadFor(identity, accessToken);
    });
  }

  has(permission: Permission): boolean {
    return this.ready() && this.granted().has(permission);
  }

  actionMode(action: ActionKey): ActionMode {
    return this.ready() ? (this.actions()[action] ?? 'blocked') : 'blocked';
  }

  async ensureLoaded(): Promise<boolean> {
    if (this.ready()) return true;
    await this.loadFor(
      this.supabase.offlineIdentity(),
      this.supabase.session()?.access_token ?? null
    );
    return this.ready();
  }

  async refresh(): Promise<void> {
    await this.loadFor(
      this.supabase.offlineIdentity(),
      this.supabase.session()?.access_token ?? null,
      true
    );
  }

  private loadFor(
    identity: AppIdentity | null,
    accessToken: string | null,
    force = false
  ): Promise<void> {
    if (
      this.teamIdentity &&
      (!identity ||
        identity.companyId !== this.teamIdentity.companyId ||
        identity.userId !== this.teamIdentity.userId)
    ) {
      this.stopTeamWatch();
    }
    const key = this.contextKeyFor(identity, accessToken);
    if (!force && key === this.contextKey) {
      if (this.currentLoad) return this.currentLoad;
      if (this.state() === 'ready' || !identity) return Promise.resolve();
    }

    const sequence = ++this.sequence;
    this.contextKey = key;
    this.clear();
    if (!identity) {
      this.stopTeamWatch();
      this.currentLoad = null;
      return Promise.resolve();
    }

    const load = this.load(identity.companyId, identity.userId, sequence).finally(() => {
      if (sequence === this.sequence) this.currentLoad = null;
    });
    this.currentLoad = load;
    return load;
  }

  private contextKeyFor(identity: AppIdentity | null, accessToken: string | null): string | null {
    return identity && accessToken
      ? `${identity.companyId}:${identity.userId}:${accessToken}`
      : null;
  }

  private clear(): void {
    this.granted.set(new Set());
    this.actions.set({
      'sale.void': 'blocked',
      'sale.refund': 'blocked',
      'payment.reverse': 'blocked',
      'sale.credit_over_limit': 'blocked',
      'customer.credit.update': 'blocked',
    });
    this.error.set(null);
    this.state.set('loading');
  }

  private async load(companyId: string, userId: string, sequence: number): Promise<void> {
    const identity = { companyId, userId };
    const cached = await this.cachedAccess(identity);
    if (sequence !== this.sequence) return;
    if (cached) {
      this.commit(cached);
      this.watchTeam(identity);
      void this.fetchAccess(identity, sequence, true).catch(() => undefined);
      return;
    }
    await this.fetchAccess(identity, sequence, false);
  }

  private async fetchAccess(
    identity: AppIdentity,
    sequence: number,
    keepCachedOnError: boolean
  ): Promise<void> {
    const { data, error } = await this.supabase.client.rpc('current_access_snapshot');
    if (sequence !== this.sequence) return;
    if (error) {
      if (!keepCachedOnError) {
        this.error.set(error.message);
        this.state.set('error');
      }
      return;
    }

    const snapshot = data as unknown as AccessSnapshot;
    if (snapshot.company_id !== identity.companyId || snapshot.user_id !== identity.userId) {
      this.error.set('Access context changed');
      this.state.set('error');
      return;
    }
    const permissionsChanged =
      this.state() === 'ready' && !samePermissions(this.granted(), snapshot.permissions);
    if (permissionsChanged) await this.journal.purgeSensitive(identity);
    if (sequence !== this.sequence) return;
    this.commit(snapshot);
    await this.persistAccess(identity, snapshot);
    if (sequence === this.sequence) this.watchTeam(identity);
  }

  private commit(snapshot: AccessSnapshot): void {
    this.granted.set(new Set(snapshot.permissions));
    this.actions.set(snapshot.actions);
    this.error.set(null);
    this.state.set('ready');
  }

  private async cachedAccess(identity: AppIdentity): Promise<AccessSnapshot | null> {
    const scope = offlineScopeKey(identity);
    const cached = await (await offlineDb()).get('snapshots', `${scope}:access`);
    const snapshot = cached?.value as AccessSnapshot | undefined;
    return cached &&
      cached.company_id === identity.companyId &&
      cached.user_id === identity.userId &&
      validAccessSnapshot(snapshot, identity)
      ? snapshot
      : null;
  }

  private async persistAccess(identity: AppIdentity, snapshot: AccessSnapshot): Promise<void> {
    const scope = offlineScopeKey(identity);
    const cached: NamedSnapshot = {
      key: `${scope}:access`,
      name: 'access',
      company_id: identity.companyId,
      user_id: identity.userId,
      value: snapshot,
      fetched_at: new Date().toISOString(),
    };
    await (await offlineDb()).put('snapshots', cached);
  }

  private watchTeam(identity: AppIdentity): void {
    const scope = offlineScopeKey(identity);
    if (scope === this.teamScope) return;
    if (this.teamIdentity) void this.journal.purgeSensitive(this.teamIdentity);
    if (this.teamChannel) void this.supabase.client.removeChannel(this.teamChannel);
    this.teamScope = scope;
    this.teamIdentity = identity;
    this.teamHandler = {
      apply: async changes => {
        if (
          !changes.some(change =>
            ['role', 'membership', 'membership_location'].includes(change.entityType)
          )
        ) {
          return;
        }
        await this.journal.purgeSensitive(identity);
        await this.loadFor(identity, this.supabase.session()?.access_token ?? null, true);
      },
      reset: async () => {
        await this.journal.purgeSensitive(identity);
        await this.loadFor(identity, this.supabase.session()?.access_token ?? null, true);
        return true;
      },
    };
    this.teamChannel = this.journal.subscribe(
      'team',
      scope,
      identity.companyId,
      this.teamHandler,
      'permissions'
    );
  }

  private stopTeamWatch(): void {
    if (this.teamScope && this.teamHandler) {
      this.journal.unsubscribe('team', this.teamScope, this.teamHandler, 'permissions');
    }
    if (this.teamIdentity) void this.journal.purgeSensitive(this.teamIdentity);
    if (this.teamChannel) void this.supabase.client.removeChannel(this.teamChannel);
    this.teamChannel = null;
    this.teamHandler = null;
    this.teamScope = null;
    this.teamIdentity = null;
  }
}

function validAccessSnapshot(
  snapshot: AccessSnapshot | undefined,
  identity: AppIdentity
): snapshot is AccessSnapshot {
  return (
    !!snapshot &&
    snapshot.company_id === identity.companyId &&
    snapshot.user_id === identity.userId &&
    Array.isArray(snapshot.permissions) &&
    !!snapshot.actions
  );
}

function samePermissions(current: ReadonlySet<Permission>, next: readonly Permission[]): boolean {
  return current.size === next.length && next.every(permission => current.has(permission));
}
