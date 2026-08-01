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
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: '**', redirectTo: 'dashboard' },
];
