import { Routes, type CanDeactivateFn } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guard';
import { locationGuard } from './core/location.guard';
import { permissionGuard } from './core/permission.guard';
import { featureGuard } from './core/feature.guard';
import { legalAcceptanceGuard } from './legal/legal.guard';

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
    canActivateChild: [locationGuard],
    loadComponent: () => import('./shell/shell.component').then(m => m.ShellComponent),
    children: [
      {
        path: 'dashboard',
        data: { preload: true },
        loadComponent: () =>
          import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent),
      },
      {
        path: 'pos/sell',
        data: { preload: true },
        loadComponent: () => import('./pos/sell/sell.component').then(m => m.SellComponent),
      },
      { path: 'pos/sales', redirectTo: 'sales' },
      {
        path: 'pos/proformas',
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
        loadComponent: () =>
          import('./pos/sync/pending-sync.component').then(m => m.PendingSyncComponent),
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
            path: 'reconcile',
            loadComponent: () =>
              import('./money/reconciliation/money-reconciliation.component').then(
                m => m.MoneyReconciliationComponent
              ),
          },
          {
            path: 'stock',
            redirectTo: '/stock-adjustments',
          },
          { path: '', pathMatch: 'full', redirectTo: 'cashier' },
        ],
      },
      {
        path: 'products',
        data: { preload: true },
        loadComponent: () => import('./products/products.component').then(m => m.ProductsComponent),
      },
      {
        path: 'customers',
        data: { preload: true },
        loadComponent: () =>
          import('./customers/customers.component').then(m => m.CustomersComponent),
      },
      {
        path: 'suppliers',
        loadComponent: () =>
          import('./suppliers/suppliers.component').then(m => m.SuppliersComponent),
      },
      {
        path: 'purchases/new',
        canDeactivate: [confirmUnsavedChanges],
        loadComponent: () =>
          import('./purchases/purchase-editor.component').then(m => m.PurchaseEditorComponent),
      },
      {
        path: 'purchases/drafts/:id',
        canDeactivate: [confirmUnsavedChanges],
        loadComponent: () =>
          import('./purchases/purchase-editor.component').then(m => m.PurchaseEditorComponent),
      },
      {
        path: 'purchases',
        data: { purchasePage: true },
        loadComponent: () =>
          import('./suppliers/suppliers.component').then(m => m.SuppliersComponent),
      },
      {
        path: 'credit',
        redirectTo: '/customers',
      },
      {
        path: 'stock-adjustments',
        canActivate: [permissionGuard],
        data: { permission: 'ManageStockAdjustments' },
        loadComponent: () =>
          import('./stock-adjustments/stock-adjustments.component').then(
            m => m.StockAdjustmentsComponent
          ),
      },
      {
        path: 'stock-transfers',
        canActivate: [permissionGuard],
        data: { permission: 'ManageStockAdjustments' },
        loadComponent: () =>
          import('./inventory/stock-transfers.component').then(m => m.StockTransfersComponent),
      },
      {
        path: 'team',
        canActivate: [permissionGuard],
        data: { permission: 'ManageTeam', preload: true },
        loadComponent: () => import('./team/team.component').then(m => m.TeamComponent),
      },
      {
        path: 'profile',
        loadComponent: () => import('./profile/profile.component').then(m => m.ProfileComponent),
      },
      {
        path: 'staff-performance',
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
        path: 'sales',
        data: { preload: true },
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
        path: 'settings/audit-trail',
        canActivate: [permissionGuard],
        data: { permission: 'ViewAuditTrail' },
        loadComponent: () => import('./audit/audit.component').then(m => m.AuditComponent),
      },
      {
        path: 'settings',
        loadComponent: () => import('./settings/settings.component').then(m => m.SettingsComponent),
      },
      {
        path: 'billing',
        loadComponent: () => import('./billing/billing.component').then(m => m.BillingComponent),
      },
      {
        path: 'notifications',
        loadComponent: () =>
          import('./notifications/notifications.component').then(m => m.NotificationsComponent),
      },
      {
        path: 'communications',
        canActivate: [permissionGuard],
        data: { permission: 'ManageCommunications' },
        loadComponent: () =>
          import('./messaging/messaging.component').then(m => m.CommunicationsComponent),
      },
      { path: 'messaging', redirectTo: 'communications' },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
