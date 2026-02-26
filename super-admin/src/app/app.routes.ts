import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent) },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/layout.component').then(m => m.LayoutComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', loadComponent: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent) },
      { path: 'channels', loadComponent: () => import('./pages/channels/channels-list/channels-list.component').then(m => m.ChannelsListComponent) },
      { path: 'channels/:id', loadComponent: () => import('./pages/channels/channel-detail/channel-detail.component').then(m => m.ChannelDetailComponent) },
      { path: 'users', loadComponent: () => import('./pages/users/users-list/users-list.component').then(m => m.UsersListComponent) },
      { path: 'platform-data', loadComponent: () => import('./pages/platform-data/platform-data.component').then(m => m.PlatformDataComponent) },
      { path: 'role-templates', loadComponent: () => import('./pages/role-templates/role-templates-list.component').then(m => m.RoleTemplatesListComponent) },
      { path: 'pending-registrations', loadComponent: () => import('./pages/pending-registrations/pending-registrations.component').then(m => m.PendingRegistrationsComponent) },
      { path: 'subscription-tiers', loadComponent: () => import('./pages/subscription-tiers/subscription-tiers.component').then(m => m.SubscriptionTiersComponent) },
      { path: 'ml-trainer', loadComponent: () => import('./pages/ml-trainer-management/ml-trainer-management.component').then(m => m.MlTrainerManagementComponent) },
    ],
  },
  { path: '**', redirectTo: '' },
];
