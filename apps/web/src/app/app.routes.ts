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
      {
        path: 'pos/sales',
        loadComponent: () =>
          import('./pos/sales/today-sales.component').then(m => m.TodaySalesComponent),
      },
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
        path: 'money/cashier',
        loadComponent: () =>
          import('./money/cashier/money-cashier.component').then(m => m.MoneyCashierComponent),
      },
      {
        path: 'money/expenses',
        loadComponent: () =>
          import('./money/expenses/money-expenses.component').then(m => m.MoneyExpensesComponent),
      },
      {
        path: 'money/transfers',
        loadComponent: () =>
          import('./money/transfers/money-transfers.component').then(
            m => m.MoneyTransfersComponent
          ),
      },
      {
        path: 'money/credit',
        loadComponent: () =>
          import('./money/credit/money-credit.component').then(m => m.MoneyCreditComponent),
      },
      {
        path: 'money/suppliers',
        loadComponent: () =>
          import('./money/suppliers/money-suppliers.component').then(
            m => m.MoneySuppliersComponent
          ),
      },
      {
        path: 'money/periods',
        loadComponent: () =>
          import('./money/periods/money-periods.component').then(m => m.MoneyPeriodsComponent),
      },
      {
        path: 'money/stock',
        loadComponent: () =>
          import('./money/stock/money-stock.component').then(m => m.MoneyStockComponent),
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
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
