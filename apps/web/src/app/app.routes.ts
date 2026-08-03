import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
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
      { path: 'pos/sales', redirectTo: 'orders' },
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
            redirectTo: '/customers',
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
        path: 'credit',
        redirectTo: '/customers',
      },
      {
        path: 'stock-adjustments',
        loadComponent: () =>
          import('./stock-adjustments/stock-adjustments.component').then(
            m => m.StockAdjustmentsComponent
          ),
      },
      {
        path: 'team',
        loadComponent: () => import('./team/team.component').then(m => m.TeamComponent),
      },
      {
        path: 'orders',
        loadComponent: () => import('./orders/orders.component').then(m => m.OrdersComponent),
      },
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
