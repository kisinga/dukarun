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
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent),
  },
  {
    path: 'pos/sell',
    canActivate: [authGuard],
    loadComponent: () => import('./pos/sell/sell.component').then(m => m.SellComponent),
  },
  {
    path: 'pos/sales',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pos/sales/today-sales.component').then(m => m.TodaySalesComponent),
  },
  {
    path: 'pos/proformas',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pos/proformas/proformas.component').then(m => m.ProformasComponent),
  },
  {
    path: 'pos/cashier',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pos/cashier/cashier-queue.component').then(m => m.CashierQueueComponent),
  },
  {
    path: 'pos/sync',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pos/sync/pending-sync.component').then(m => m.PendingSyncComponent),
  },
  {
    path: 'money/cashier',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./money/cashier/money-cashier.component').then(m => m.MoneyCashierComponent),
  },
  {
    path: 'money/expenses',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./money/expenses/money-expenses.component').then(m => m.MoneyExpensesComponent),
  },
  {
    path: 'money/transfers',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./money/transfers/money-transfers.component').then(m => m.MoneyTransfersComponent),
  },
  {
    path: 'money/credit',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./money/credit/money-credit.component').then(m => m.MoneyCreditComponent),
  },
  {
    path: 'money/suppliers',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./money/suppliers/money-suppliers.component').then(m => m.MoneySuppliersComponent),
  },
  {
    path: 'money/periods',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./money/periods/money-periods.component').then(m => m.MoneyPeriodsComponent),
  },
  {
    path: 'money/stock',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./money/stock/money-stock.component').then(m => m.MoneyStockComponent),
  },
  {
    path: 'products',
    canActivate: [authGuard],
    loadComponent: () => import('./products/products.component').then(m => m.ProductsComponent),
  },
  {
    path: 'customers',
    canActivate: [authGuard],
    loadComponent: () => import('./customers/customers.component').then(m => m.CustomersComponent),
  },
  {
    path: 'team',
    canActivate: [authGuard],
    loadComponent: () => import('./team/team.component').then(m => m.TeamComponent),
  },
  {
    path: 'orders',
    canActivate: [authGuard],
    loadComponent: () => import('./orders/orders.component').then(m => m.OrdersComponent),
  },
  {
    path: 'reports',
    canActivate: [authGuard],
    loadComponent: () => import('./reports/reports.component').then(m => m.ReportsComponent),
  },
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: '**', redirectTo: 'dashboard' },
];
