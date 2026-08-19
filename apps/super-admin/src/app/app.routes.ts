import { Routes } from '@angular/router';
import { platformGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [platformGuard],
    loadComponent: () => import('./shell/shell.component').then(m => m.ShellComponent),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent),
      },
      {
        path: 'companies',
        loadComponent: () =>
          import('./pages/companies/companies.component').then(m => m.CompaniesComponent),
      },
      {
        path: 'tiers',
        loadComponent: () => import('./pages/tiers/tiers.component').then(m => m.TiersComponent),
      },
      {
        path: 'tax',
        loadComponent: () => import('./pages/tax/tax.component').then(m => m.TaxComponent),
      },
      {
        path: 'mpesa',
        loadComponent: () => import('./pages/mpesa/mpesa.component').then(m => m.MpesaComponent),
      },
      {
        path: 'communications',
        loadComponent: () =>
          import('./pages/communications/communications.component').then(
            m => m.CommunicationsComponent
          ),
      },
      {
        path: 'operations',
        loadComponent: () =>
          import('./pages/operations/operations.component').then(m => m.OperationsComponent),
      },
      {
        path: 'audit',
        loadComponent: () => import('./pages/audit/audit.component').then(m => m.AuditComponent),
      },
      {
        path: 'legal',
        loadComponent: () => import('./pages/legal/legal.component').then(m => m.LegalComponent),
      },
      {
        path: 'blog',
        loadComponent: () => import('./pages/blog/blog.component').then(m => m.BlogComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
