import { computed, inject, Injectable } from '@angular/core';
import { Permission } from '../../graphql/generated/graphql';
import type { ActiveAdministrator } from '../../models/user.model';
import { AuthSessionService } from './auth-session.service';

/**
 * Auth Permissions Service
 *
 * Handles permission checking logic.
 * Pure permission logic with computed signals.
 */
@Injectable({
  providedIn: 'root',
})
export class AuthPermissionsService {
  private readonly sessionService = inject(AuthSessionService);

  readonly hasUpdateSettingsPermission = computed(() => {
    const user = this.sessionService.user();
    if (!user?.user?.roles) return false;

    // Check if user has UpdateSettings permission in ANY role
    const hasPermission = user.user.roles.some((role) =>
      role.permissions.includes(Permission.UpdateSettings),
    );

    console.log('🔐 Permission check:', {
      user: user?.firstName,
      roles: user?.user?.roles?.map((r) => ({ code: r.code, permissions: r.permissions })),
      hasPermission,
    });

    return hasPermission;
  });

  readonly hasOverridePricePermission = computed(() => {
    const user = this.sessionService.user();
    if (!user?.user?.roles) return false;

    // Check if user has OverridePrice permission in ANY role
    const hasPermission = user.user.roles.some((role) =>
      role.permissions.includes(Permission.OverridePrice),
    );

    console.log('🔐 OverridePrice permission check:', {
      user: user?.firstName,
      roles: user?.user?.roles?.map((r) => ({ code: r.code, permissions: r.permissions })),
      hasPermission,
    });

    return hasPermission;
  });

  readonly hasCreditManagementPermission = computed(() => {
    const user = this.sessionService.user();
    if (!user?.user?.roles) return false;

    const hasPermission = user.user.roles.some((role) =>
      role.permissions.some((permission) => {
        const value = String(permission);
        return value === 'ApproveCustomerCredit' || value === 'ManageCustomerCreditLimit';
      }),
    );

    return hasPermission;
  });

  readonly hasManageStockAdjustmentsPermission = computed(() => {
    const user = this.sessionService.user();
    if (!user?.user?.roles) return false;

    const hasPermission = user.user.roles.some((role) =>
      role.permissions.includes('ManageStockAdjustments' as any),
    );

    return hasPermission;
  });

  readonly hasCreateInterAccountTransferPermission = computed(() => {
    const user = this.sessionService.user();
    if (!user?.user?.roles) return false;
    return user.user.roles.some((role) =>
      role.permissions.includes('CreateInterAccountTransfer' as any),
    );
  });

  readonly hasManageApprovalsPermission = computed(() => {
    const user = this.sessionService.user();
    if (!user?.user?.roles) return false;
    return user.user.roles.some((role) => role.permissions.includes('ManageApprovals' as any));
  });

  readonly hasReverseOrderPermission = computed(() => {
    const user = this.sessionService.user();
    if (!user?.user?.roles) return false;
    return user.user.roles.some((role) => role.permissions.includes('ReverseOrder' as any));
  });

  readonly hasOverrideCustomerBalancePermission = computed(() => {
    const user = this.sessionService.user();
    if (!user?.user?.roles) return false;
    return user.user.roles.some((role) =>
      role.permissions.includes('OverrideCustomerBalance' as any),
    );
  });

  readonly hasUpdateProductPermission = computed(() => {
    const user = this.sessionService.user();
    if (!user?.user?.roles) return false;
    return user.user.roles.some((role) => role.permissions.includes(Permission.UpdateProduct));
  });

  readonly hasSuperAdminPermission = computed(() => {
    const user = this.sessionService.user();
    if (!user?.user?.roles) return false;
    return user.user.roles.some((role) => role.permissions.includes(Permission.SuperAdmin));
  });

  /**
   * Can view business financial figures — the Finances section, balances, P&L,
   * receivables/payables, ledger. Backed by the `ViewFinancials` permission
   * (granted to admin/accountant/cashier) or SuperAdmin. Operational figures
   * (cart/order totals, own shift count) are not gated by this.
   */
  readonly canViewFinancials = computed(() => {
    const user = this.sessionService.user();
    if (!user?.user?.roles) return false;
    return user.user.roles.some(
      (role) =>
        role.permissions.includes('ViewFinancials' as Permission) ||
        role.permissions.includes(Permission.SuperAdmin),
    );
  });

  /**
   * Can settle orders at the cashier (collect payment / split payments). Backed by the
   * `SettleOrder` permission (granted to admin/cashier) or SuperAdmin. Gates the cashier
   * queue route and the settlement action.
   */
  readonly canSettleOrders = computed(() => {
    const user = this.sessionService.user();
    if (!user?.user?.roles) return false;
    return user.user.roles.some(
      (role) =>
        role.permissions.includes('SettleOrder' as Permission) ||
        role.permissions.includes(Permission.SuperAdmin),
    );
  });

  /**
   * Check if user has a specific role (extend as needed)
   */
  hasRole(role: string): boolean {
    // Implement role checking logic based on your user model
    return false;
  }
}
