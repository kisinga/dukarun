import { Injectable, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';

/** The 14 assignable permissions (role editor checkboxes; mirrored in the DB role templates). */
export const ALL_PERMISSIONS = [
  'ManageApprovals',
  'OverridePrice',
  'ManageStockAdjustments',
  'ApproveCustomerCredit',
  'ManageCustomerCreditLimit',
  'ReverseOrder',
  'OverrideCustomerBalance',
  'SettleOrder',
  'ManageSupplierCreditPurchases',
  'ViewFinancials',
  'ManageReconciliation',
  'CloseAccountingPeriod',
  'CreateInterAccountTransfer',
  'ManageTeam',
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

/**
 * Current user's permission set (The Counter — people see only what their role allows).
 * Source of truth is the DB: RLS already gates financial reads server-side; this service
 * mirrors that in the UI (hide nav, mask amounts) via the same current_user_has_permission()
 * function the policies use. Fails closed: until loaded, nothing is granted.
 */
@Injectable({ providedIn: 'root' })
export class PermissionsService {
  private readonly supabase = inject(SupabaseService);

  private readonly granted = signal<ReadonlySet<Permission>>(new Set());
  /** False until the first successful load — treat UI as ungated-loading. */
  readonly ready = signal(false);

  constructor() {
    effect(() => {
      if (this.supabase.session()) {
        void this.load();
      } else {
        this.granted.set(new Set());
        this.ready.set(false);
      }
    });
  }

  has(permission: Permission): boolean {
    return this.granted().has(permission);
  }

  private async load(): Promise<void> {
    const checks = await Promise.all(
      ALL_PERMISSIONS.map(async p => {
        const { data, error } = await this.supabase.client.rpc('current_user_has_permission', {
          p_permission: p,
        });
        return error || !data ? null : p;
      })
    );
    this.granted.set(new Set(checks.filter((p): p is Permission => p !== null)));
    this.ready.set(true);
  }
}
