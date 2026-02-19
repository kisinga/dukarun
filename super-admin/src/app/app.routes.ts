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
      { path: 'subscription-tiers', loadComponent: () => import('./pages/subscription-tiers/subscription-tiers.component').then(m => m.SubscriptionTiersComponent) },
    ],
  },
  { path: '**', redirectTo: '' },
];
