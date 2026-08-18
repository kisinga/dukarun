import { describe, expect, it } from 'vitest';
import { Permission } from './permissions.service';
import {
  WorkspaceAccess,
  workspaceEntryRoute,
  workspaceNavigationItems,
} from './workspace-navigation.service';

function access(
  permissions: readonly Permission[] = [],
  overrides: Partial<Omit<WorkspaceAccess, 'has'>> = {}
): WorkspaceAccess {
  return {
    has: permission => permissions.includes(permission),
    staffPerformanceEnabled: false,
    commissionsVisible: false,
    multiLocation: false,
    ...overrides,
  };
}

describe('workspace navigation', () => {
  it('shows only the permitted Activity views and prefers Messages', () => {
    expect(workspaceNavigationItems('activity', access())).toEqual([]);
    expect(
      workspaceNavigationItems('activity', access(['ManageCommunications'])).map(item => item.label)
    ).toEqual(['Messages']);
    expect(
      workspaceNavigationItems('activity', access(['ViewAuditTrail'])).map(item => item.label)
    ).toEqual(['Audit trail']);

    const both = access(['ManageCommunications', 'ViewAuditTrail']);
    expect(workspaceNavigationItems('activity', both).map(item => item.label)).toEqual([
      'Messages',
      'Audit trail',
    ]);
    expect(workspaceEntryRoute('activity', both)).toBe('/activity/messages');
  });

  it('always exposes Products and gates inventory operations by access and location count', () => {
    expect(workspaceNavigationItems('inventory', access()).map(item => item.label)).toEqual([
      'Products',
    ]);
    expect(
      workspaceNavigationItems('inventory', access(['ManageStockAdjustments'])).map(
        item => item.label
      )
    ).toEqual(['Products', 'Adjustments']);
    expect(
      workspaceNavigationItems(
        'inventory',
        access(['ManageStockAdjustments'], { multiLocation: true })
      ).map(item => item.label)
    ).toEqual(['Products', 'Adjustments', 'Transfers']);
  });

  it('builds Team views from independent permissions and entitlements', () => {
    expect(
      workspaceNavigationItems('team', access(['ManageTeam'])).map(item => item.label)
    ).toEqual(['Members', 'Roles']);
    expect(
      workspaceNavigationItems(
        'team',
        access(['ViewStaffPerformance'], { staffPerformanceEnabled: true })
      ).map(item => item.label)
    ).toEqual(['Performance']);
    expect(
      workspaceNavigationItems(
        'team',
        access(['ManageCommissions'], { commissionsVisible: true })
      ).map(item => item.label)
    ).toEqual(['Commissions']);
    expect(
      workspaceNavigationItems(
        'team',
        access(['ViewStaffPerformance', 'ManageCommissions'], {
          staffPerformanceEnabled: false,
          commissionsVisible: false,
        })
      )
    ).toEqual([]);
  });

  it('uses the documented Team landing priority and honors the legacy Roles tab', () => {
    const manager = access(['ManageTeam', 'ViewStaffPerformance', 'ManageCommissions'], {
      staffPerformanceEnabled: true,
      commissionsVisible: true,
    });
    expect(workspaceEntryRoute('team', manager)).toBe('/team/members');
    expect(workspaceEntryRoute('team', manager, 'roles')).toBe('/team/roles');

    const performanceOnly = access(['ViewStaffPerformance'], {
      staffPerformanceEnabled: true,
    });
    expect(workspaceEntryRoute('team', performanceOnly)).toBe('/team/performance');
    expect(workspaceEntryRoute('team', performanceOnly, 'roles')).toBe('/team/performance');

    const commissionsOnly = access(['ManageCommissions'], { commissionsVisible: true });
    expect(workspaceEntryRoute('team', commissionsOnly)).toBe('/team/commissions');
    expect(workspaceEntryRoute('team', access())).toBeNull();
  });
});
