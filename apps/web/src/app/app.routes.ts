import { Routes, type CanDeactivateFn } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guard';
import { locationGuard } from './core/location.guard';
import { permissionGuard } from './core/permission.guard';
import { featureGuard } from './core/feature.guard';
import { workspaceLandingRedirect } from './core/workspace-landing.redirect';
import { multiLocationGuard } from './core/multi-location.guard';
import { preserveQueryRedirect } from './core/route-redirect';
import { legalAcceptanceGuard } from './legal/legal.guard';
import { paidAccessGuard } from './core/paid-access.guard';

interface UnsavedChangesComponent {
  canDeactivate(): boolean;
}

const confirmUnsavedChanges: CanDeactivateFn<UnsavedChangesComponent> = component =>
  component.canDeactivate();

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'register',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/register/register.component').then(m => m.RegisterComponent),
  },
  {
    path: 'access-required',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/access-required/access-required.component').then(
        m => m.AccessRequiredComponent
      ),
  },
  {
    path: 'legal/accept',
    canActivate: [authGuard],
    loadComponent: () => import('./legal/legal-accept.component').then(m => m.LegalAcceptComponent),
  },
  {
    path: 'legal/pending',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./legal/legal-pending.component').then(m => m.LegalPendingComponent),
  },
  {
    path: 'company/pending',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./legal/legal-pending.component').then(m => m.LegalPendingComponent),
  },
  {
    path: '',
    canActivate: [authGuard, legalAcceptanceGuard],
    canActivateChild: [locationGuard, paidAccessGuard],
    loadComponent: () => import('./shell/shell.component').then(m => m.ShellComponent),
    children: [
      {
        path: 'help/journeys/first-business-cycle',
        redirectTo: '/learn/first-business-cycle',
      },
      {
        path: 'help/categories/:domain',
        loadComponent: () =>
          import('./learning/help-embed.component').then(m => m.HelpEmbedComponent),
      },
      {
        path: 'help/topics/:topic',
        loadComponent: () =>
          import('./learning/help-embed.component').then(m => m.HelpEmbedComponent),
      },
      {
        path: 'help',
        loadComponent: () =>
          import('./learning/help-embed.component').then(m => m.HelpEmbedComponent),
      },
      {
        path: 'help/:topic',
        loadComponent: () =>
          import('./learning/help-embed.component').then(m => m.HelpEmbedComponent),
      },
      {
        path: 'learn/:contentKey',
        loadComponent: () =>
          import('./learning/learning-launch.component').then(m => m.LearningLaunchComponent),
      },
      {
        path: 'dashboard',
        canActivate: [permissionGuard],
        data: { preload: true, workspaceAccess: 'dashboard' },
        loadComponent: () =>
          import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent),
      },
      {
        path: 'pos/sell',
        canActivate: [permissionGuard],
        data: { preload: true, permission: 'SettleOrder' },
        loadComponent: () => import('./pos/sell/sell.component').then(m => m.SellComponent),
      },
      { path: 'pos/sales', redirectTo: 'sales' },
      {
        path: 'pos/proformas',
        canActivate: [permissionGuard],
        data: { permission: 'SettleOrder' },
        loadComponent: () =>
          import('./pos/proformas/proformas.component').then(m => m.ProformasComponent),
      },
      {
        path: 'pos/cashier',
        canActivate: [permissionGuard],
        data: { permission: 'SettleOrder' },
        loadComponent: () =>
          import('./pos/cashier/cashier-queue.component').then(m => m.CashierQueueComponent),
      },
      {
        path: 'pos/sync',
        canActivate: [permissionGuard],
        data: { permission: 'SettleOrder' },
        loadComponent: () =>
          import('./pos/sync/pending-sync.component').then(m => m.PendingSyncComponent),
      },
      {
        path: 'fulfillment',
        canActivate: [permissionGuard, featureGuard],
        data: {
          anyPermission: [
            'ProcessFulfillments',
            'CompleteFulfillments',
            'ManageFulfillments',
            'SettleOrder',
          ],
          feature: 'fulfillment',
        },
        loadComponent: () =>
          import('./fulfillment/fulfillment.component').then(m => m.FulfillmentComponent),
      },
      {
        path: 'money',
        canActivate: [permissionGuard],
        data: { permission: 'ViewFinancials' },
        loadComponent: () =>
          import('./money/money-layout.component').then(m => m.MoneyLayoutComponent),
        children: [
          {
            path: 'ledger',
            loadComponent: () =>
              import('./money/ledger/money-ledger.component').then(m => m.MoneyLedgerComponent),
          },
          {
            path: 'cashier',
            loadComponent: () =>
              import('./money/cashier/money-cashier.component').then(m => m.MoneyCashierComponent),
          },
          {
            path: 'expenses',
            canActivate: [permissionGuard],
            data: { permission: 'CreateInterAccountTransfer' },
            loadComponent: () =>
              import('./money/expenses/money-expenses.component').then(
                m => m.MoneyExpensesComponent
              ),
          },
          {
            path: 'transfers',
            canActivate: [permissionGuard],
            data: { permission: 'CreateInterAccountTransfer' },
            loadComponent: () =>
              import('./money/transfers/money-transfers.component').then(
                m => m.MoneyTransfersComponent
              ),
          },
          {
            path: 'credit',
            loadComponent: () =>
              import('./money/credit/money-credit.component').then(m => m.MoneyCreditComponent),
          },
          {
            path: 'suppliers',
            redirectTo: '/suppliers',
          },
          {
            path: 'periods',
            loadComponent: () =>
              import('./money/periods/money-periods.component').then(m => m.MoneyPeriodsComponent),
          },
          {
            path: 'vat',
            canActivate: [permissionGuard],
            data: { permission: 'ViewFinancials' },
            loadComponent: () =>
              import('./money/vat/money-vat.component').then(m => m.MoneyVatComponent),
          },
          {
            path: 'reconcile',
            loadComponent: () =>
              import('./money/reconciliation/money-reconciliation.component').then(
                m => m.MoneyReconciliationComponent
              ),
          },
          {
            path: 'stock',
            redirectTo: preserveQueryRedirect('/inventory/adjustments'),
          },
          { path: '', pathMatch: 'full', redirectTo: 'cashier' },
        ],
      },
      {
        path: 'inventory',
        canActivate: [permissionGuard],
        data: { workspaceAccess: 'inventory' },
        children: [
          {
            path: 'products',
            data: { preload: true },
            loadComponent: () =>
              import('./products/products.component').then(m => m.ProductsComponent),
          },
          {
            path: 'adjustments',
            canActivate: [permissionGuard],
            data: { permission: 'ManageStockAdjustments' },
            loadComponent: () =>
              import('./stock-adjustments/stock-adjustments.component').then(
                m => m.StockAdjustmentsComponent
              ),
          },
          {
            path: 'transfers',
            canActivate: [permissionGuard, multiLocationGuard],
            data: { permission: 'ManageStockAdjustments' },
            loadComponent: () =>
              import('./inventory/stock-transfers.component').then(m => m.StockTransfersComponent),
          },
          {
            path: '',
            pathMatch: 'full',
            redirectTo: preserveQueryRedirect('/inventory/products'),
          },
        ],
      },
      {
        path: 'products',
        pathMatch: 'full',
        redirectTo: preserveQueryRedirect('/inventory/products'),
      },
      {
        path: 'customers',
        canActivate: [permissionGuard],
        data: { preload: true, workspaceAccess: 'customers' },
        loadComponent: () =>
          import('./customers/customers.component').then(m => m.CustomersComponent),
      },
      {
        path: 'suppliers',
        canActivate: [permissionGuard],
        data: { workspaceAccess: 'purchasing' },
        loadComponent: () =>
          import('./suppliers/suppliers.component').then(m => m.SuppliersComponent),
      },
      {
        path: 'purchases/new',
        canActivate: [permissionGuard],
        data: { workspaceAccess: 'purchasing' },
        canDeactivate: [confirmUnsavedChanges],
        loadComponent: () =>
          import('./purchases/purchase-editor.component').then(m => m.PurchaseEditorComponent),
      },
      {
        path: 'purchases/drafts/:id',
        canActivate: [permissionGuard],
        data: { workspaceAccess: 'purchasing' },
        canDeactivate: [confirmUnsavedChanges],
        loadComponent: () =>
          import('./purchases/purchase-editor.component').then(m => m.PurchaseEditorComponent),
      },
      {
        path: 'purchases',
        canActivate: [permissionGuard],
        data: { workspaceAccess: 'purchasing' },
        loadComponent: () =>
          import('./purchases/purchases.component').then(m => m.PurchasesComponent),
      },
      {
        path: 'credit',
        redirectTo: '/customers',
      },
      {
        path: 'stock-adjustments',
        pathMatch: 'full',
        redirectTo: preserveQueryRedirect('/inventory/adjustments'),
      },
      {
        path: 'stock-transfers',
        pathMatch: 'full',
        redirectTo: preserveQueryRedirect('/inventory/transfers'),
      },
      {
        path: 'team',
        children: [
          {
            path: 'members',
            canActivate: [permissionGuard],
            data: { permission: 'ManageTeam', teamView: 'members', preload: true },
            loadComponent: () => import('./team/team.component').then(m => m.TeamComponent),
          },
          {
            path: 'roles',
            canActivate: [permissionGuard],
            data: { permission: 'ManageTeam', teamView: 'roles' },
            loadComponent: () => import('./team/team.component').then(m => m.TeamComponent),
          },
          {
            path: 'performance',
            canActivate: [featureGuard, permissionGuard],
            data: { feature: 'staffPerformance', permission: 'ViewStaffPerformance' },
            loadComponent: () =>
              import('./performance/staff-performance.component').then(
                m => m.StaffPerformanceComponent
              ),
          },
          {
            path: 'commissions',
            canActivate: [featureGuard, permissionGuard],
            data: {
              feature: 'commissions',
              requiresCommissionOptIn: true,
              permission: 'ManageCommissions',
            },
            loadComponent: () =>
              import('./commissions/commissions.component').then(m => m.CommissionsComponent),
          },
          {
            path: '',
            pathMatch: 'full',
            redirectTo: workspaceLandingRedirect,
            data: { workspace: 'team' },
          },
        ],
      },
      {
        path: 'profile',
        loadComponent: () => import('./profile/profile.component').then(m => m.ProfileComponent),
      },
      {
        path: 'staff-performance',
        pathMatch: 'full',
        redirectTo: preserveQueryRedirect('/team/performance'),
      },
      {
        path: 'commissions',
        pathMatch: 'full',
        redirectTo: preserveQueryRedirect('/team/commissions'),
      },
      {
        path: 'sales',
        canActivate: [permissionGuard],
        data: { preload: true, workspaceAccess: 'sales' },
        loadComponent: () => import('./orders/orders.component').then(m => m.OrdersComponent),
      },
      { path: 'orders', redirectTo: 'sales' },
      {
        path: 'reports',
        canActivate: [permissionGuard],
        data: { permission: 'ViewFinancials' },
        loadComponent: () => import('./reports/reports.component').then(m => m.ReportsComponent),
      },
      {
        path: 'approvals',
        canActivate: [permissionGuard],
        data: { anyPermission: ['ManageApprovals', 'ViewFinancials'] },
        loadComponent: () =>
          import('./approvals/approvals.component').then(m => m.ApprovalsComponent),
      },
      {
        path: 'activity',
        children: [
          {
            path: 'messages',
            canActivate: [permissionGuard],
            data: { permission: 'ManageCommunications' },
            loadComponent: () =>
              import('./messaging/messaging.component').then(m => m.CommunicationsComponent),
          },
          {
            path: 'audit',
            canActivate: [permissionGuard],
            data: { permission: 'ViewAuditTrail' },
            loadComponent: () => import('./audit/audit.component').then(m => m.AuditComponent),
          },
          {
            path: '',
            pathMatch: 'full',
            redirectTo: workspaceLandingRedirect,
            data: { workspace: 'activity' },
          },
        ],
      },
      {
        path: 'settings/audit-trail',
        pathMatch: 'full',
        redirectTo: preserveQueryRedirect('/activity/audit'),
      },
      {
        path: 'settings',
        canActivate: [permissionGuard],
        data: { permission: 'ManageCompanySettings' },
        loadComponent: () => import('./settings/settings.component').then(m => m.SettingsComponent),
      },
      {
        path: 'billing',
        pathMatch: 'full',
        redirectTo: preserveQueryRedirect('/settings', { tab: 'billing' }),
      },
      {
        path: 'notifications',
        loadComponent: () =>
          import('./notifications/notifications.component').then(m => m.NotificationsComponent),
      },
      {
        path: 'communications',
        pathMatch: 'full',
        redirectTo: preserveQueryRedirect('/activity/messages'),
      },
      {
        path: 'messaging',
        pathMatch: 'full',
        redirectTo: preserveQueryRedirect('/activity/messages'),
      },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
