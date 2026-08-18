import { Injectable, computed, inject } from '@angular/core';
import { EntitlementsService } from './entitlements.service';
import { LocationContextService } from './location-context.service';
import { Permission, PermissionsService } from './permissions.service';

export type WorkspaceKey = 'activity' | 'inventory' | 'team';

export interface WorkspaceNavItem {
  label: string;
  route: string;
}

export interface WorkspaceAccess {
  has(permission: Permission): boolean;
  staffPerformanceEnabled: boolean;
  commissionsVisible: boolean;
  multiLocation: boolean;
}

export function workspaceNavigationItems(
  workspace: WorkspaceKey,
  access: WorkspaceAccess
): readonly WorkspaceNavItem[] {
  switch (workspace) {
    case 'activity':
      return [
        ...(access.has('ManageCommunications')
          ? [{ label: 'Messages', route: '/activity/messages' }]
          : []),
        ...(access.has('ViewAuditTrail')
          ? [{ label: 'Audit trail', route: '/activity/audit' }]
          : []),
      ];
    case 'inventory':
      return [
        { label: 'Products', route: '/inventory/products' },
        ...(access.has('ManageStockAdjustments')
          ? [{ label: 'Adjustments', route: '/inventory/adjustments' }]
          : []),
        ...(access.has('ManageStockAdjustments') && access.multiLocation
          ? [{ label: 'Transfers', route: '/inventory/transfers' }]
          : []),
      ];
    case 'team':
      return [
        ...(access.has('ManageTeam')
          ? [
              { label: 'Members', route: '/team/members' },
              { label: 'Roles', route: '/team/roles' },
            ]
          : []),
        ...(access.has('ViewStaffPerformance') && access.staffPerformanceEnabled
          ? [{ label: 'Performance', route: '/team/performance' }]
          : []),
        ...(access.has('ManageCommissions') && access.commissionsVisible
          ? [{ label: 'Commissions', route: '/team/commissions' }]
          : []),
      ];
  }
}

export function workspaceEntryRoute(
  workspace: WorkspaceKey,
  access: WorkspaceAccess,
  legacyTeamTab?: string | null
): string | null {
  if (workspace === 'team' && legacyTeamTab === 'roles' && access.has('ManageTeam')) {
    return '/team/roles';
  }
  return workspaceNavigationItems(workspace, access)[0]?.route ?? null;
}

@Injectable({ providedIn: 'root' })
export class WorkspaceNavigationService {
  private readonly permissions = inject(PermissionsService);
  private readonly entitlements = inject(EntitlementsService);
  private readonly locations = inject(LocationContextService);

  private readonly access = computed<WorkspaceAccess>(() => {
    const canViewPerformance = this.permissions.has('ViewStaffPerformance');
    const canManageCommissions = this.permissions.has('ManageCommissions');
    return {
      has: permission => this.permissions.has(permission),
      staffPerformanceEnabled: canViewPerformance && this.entitlements.enabled('staffPerformance'),
      commissionsVisible: canManageCommissions && this.entitlements.commissionsVisible(),
      multiLocation: this.locations.isMultiLocation(),
    };
  });

  readonly activityItems = computed(() => workspaceNavigationItems('activity', this.access()));
  readonly inventoryItems = computed(() => workspaceNavigationItems('inventory', this.access()));
  readonly teamItems = computed(() => workspaceNavigationItems('team', this.access()));

  items(workspace: WorkspaceKey): readonly WorkspaceNavItem[] {
    switch (workspace) {
      case 'activity':
        return this.activityItems();
      case 'inventory':
        return this.inventoryItems();
      case 'team':
        return this.teamItems();
    }
  }

  entryRoute(workspace: WorkspaceKey): string | null {
    return workspaceEntryRoute(workspace, this.access());
  }

  landingRoute(workspace: WorkspaceKey, legacyTeamTab?: string | null): string | null {
    return workspaceEntryRoute(workspace, this.access(), legacyTeamTab);
  }

  visible(workspace: WorkspaceKey): boolean {
    return this.items(workspace).length > 0;
  }
}
