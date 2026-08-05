import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guard';
import { permissionGuard } from './core/permission.guard';
import { featureGuard } from './core/feature.guard';

export const routes: Routes = [
  // Public marketing surface — no auth required. Placed first so '/', '/about'
  // and '/contact' resolve here; app paths (dashboard, sales, …) fall through
  // to the guarded shell below.
  {
    path: '',
    loadComponent: () =>
      import('./marketing/marketing-layout.component').then(m => m.MarketingLayoutComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./marketing/home/home.component').then(m => m.HomeComponent),
      },
      {
        path: 'about',
        loadComponent: () =>
          import('./marketing/about/about.component').then(m => m.AboutComponent),
      },
      {
        path: 'contact',
        loadComponent: () =>
          import('./marketing/contact/contact.component').then(m => m.ContactComponent),
      },
      {
        path: 'docs',
        loadComponent: () => import('./marketing/docs/docs.component').then(m => m.DocsComponent),
      },
    ],
  },
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
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./shell/shell.component').then(m => m.ShellComponent),
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent),
      },
      {
        path: 'pos/sell',
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
            loadComponent: () =>
              import('./money/expenses/money-expenses.component').then(
                m => m.MoneyExpensesComponent
              ),
          },
          {
            path: 'transfers',
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
            path: 'stock',
            redirectTo: '/stock-adjustments',
          },
          { path: '', pathMatch: 'full', redirectTo: 'cashier' },
        ],
      },
      {
        path: 'products',
        loadComponent: () => import('./products/products.component').then(m => m.ProductsComponent),
      },
      {
        path: 'customers',
        loadComponent: () =>
          import('./customers/customers.component').then(m => m.CustomersComponent),
      },
      {
        path: 'suppliers',
        loadComponent: () =>
          import('./suppliers/suppliers.component').then(m => m.SuppliersComponent),
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
        loadComponent: () => import('./orders/orders.component').then(m => m.OrdersComponent),
      },
      { path: 'orders', redirectTo: 'sales' },
      {
        path: 'reports',
        loadComponent: () => import('./reports/reports.component').then(m => m.ReportsComponent),
      },
      {
        path: 'approvals',
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
        path: 'messaging',
        loadComponent: () =>
          import('./messaging/messaging.component').then(m => m.MessagingComponent),
      },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
